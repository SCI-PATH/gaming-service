"""
Persistent ChromaDB ops for Grade 6–9 Science mind maps.

Collection: science_textbooks
Persist dir: <repo>/data/chroma

JSON-line worker:
  python chroma_ops.py worker
  stdin:  {"id":"1","op":"query","payload":{...}}
  stdout: {"id":"1","ok":true,"result":{...}}
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

BACKEND_DIR = Path(__file__).resolve().parents[1]
ROOT = Path(os.environ.get("GAMING_ROOT") or BACKEND_DIR.parent)
CHROMA_DIR = Path(os.environ.get("CHROMA_PERSIST_DIR") or (ROOT / "data" / "chroma"))
REGISTRY_PATH = ROOT / "data" / "textbook_registry" / "textbooks.json"
PDF_DIR = ROOT / "data" / "textbooks"
COLLECTION = os.environ.get("CHROMA_MINDMAP_COLLECTION") or "science_textbooks"
RAG_MIN_RELEVANCE = float(os.environ.get("RAG_MIN_RELEVANCE") or "0.32")
PDF_MAX_BYTES = int(os.environ.get("PDF_MAX_BYTES") or str(150 * 1024 * 1024))
PDF_MAX_PAGES = int(os.environ.get("PDF_MAX_PAGES") or "500")

for scripts_dir in (ROOT / "scripts", BACKEND_DIR / "scripts", Path(__file__).resolve().parent):
    if scripts_dir.is_dir():
        sys.path.insert(0, str(scripts_dir))

CHAPTER_RE = re.compile(
    r"^(?:chapter\s+(\d+)[:.\-\s]+(.+)|unit\s+(\d+)[:.\-\s]+(.+))$",
    re.I,
)
SECTION_RE = re.compile(r"^(\d+\.\d+(?:\.\d+)?)(?:\s+)(.{3,120})$")
SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z])")
STOP = {
    "a", "an", "the", "i", "me", "my", "we", "you", "your", "is", "are", "was",
    "were", "be", "to", "of", "in", "on", "for", "and", "or", "but", "why",
    "how", "what", "when", "where", "which", "who", "do", "does", "did", "can",
    "could", "would", "should", "please", "dont", "understand", "explain",
    "tell", "about", "need", "needed", "help",
}
HINTS = (
    ("sunlight", ("photosynthesis", "chlorophyll", "food production")),
    ("photosynthesis", ("sunlight", "chlorophyll", "leaves", "food")),
    ("monocotyledon", ("monocot", "dicotyledon", "cotyledon", "seed")),
    ("monocot", ("monocotyledon", "dicotyledon", "cotyledon", "seed")),
    ("dicotyledon", ("dicot", "monocotyledon", "cotyledon", "seed")),
    ("dicot", ("dicotyledon", "monocotyledon", "cotyledon")),
    ("leaves", ("leaf", "photosynthesis", "shape", "venation")),
    ("leaf", ("leaves", "photosynthesis", "shape")),
    ("digest", ("digestive system", "stomach", "intestine", "enzymes")),
    ("cell", ("cell membrane", "nucleus", "cytoplasm")),
)

DEFAULT_BOOKS = [
    {
        "grade": 6,
        "part": None,
        "title": "Grade 6 Science",
        "source_url": "http://www.edupub.gov.lk/Administrator/English/6/science%20G-6%20%20E/science%20G-6%20E.pdf",
    },
    {
        "grade": 7,
        "part": 1,
        "title": "Grade 7 Science Part I",
        "source_url": "http://www.edupub.gov.lk/Administrator/English/7/science%20G-7%20P-I%20E/science%20G-7%20P-I%20E.pdf",
    },
    {
        "grade": 7,
        "part": 2,
        "title": "Grade 7 Science Part II",
        "source_url": "http://www.edupub.gov.lk/Administrator/English/7/science%20G-7%20P-II%20E/science%20G-7%20P-II%20E.pdf",
    },
    {
        "grade": 8,
        "part": 1,
        "title": "Grade 8 Science Part I",
        "source_url": "http://www.edupub.gov.lk/Administrator/English/8/science%20G-8%20P-I%20E/science%20G8%20P-I%20E.pdf",
    },
    {
        "grade": 8,
        "part": 2,
        "title": "Grade 8 Science Part II",
        "source_url": "http://www.edupub.gov.lk/Administrator/English/8/science%20G-8%20P-II%20E/science%20G-8%20P-II%20E.pdf",
    },
    {
        "grade": 9,
        "part": 1,
        "title": "Grade 9 Science Part I",
        "source_url": "http://www.edupub.gov.lk/Administrator/English/9/science%20G-9%20P-I%20E/science%20G-9%20P-I%20E.pdf",
    },
    {
        "grade": 9,
        "part": 2,
        "title": "Grade 9 Science Part II",
        "source_url": "http://www.edupub.gov.lk/Administrator/English/9/science%20G-9%20P-II%20E/Science%20Part%20II%20English%20G-9.pdf",
    },
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_registry() -> list[dict]:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    if not REGISTRY_PATH.is_file():
        rows = []
        for item in DEFAULT_BOOKS:
            rows.append(
                {
                    "id": str(uuid.uuid4()),
                    "grade": item["grade"],
                    "subject": "Science",
                    "title": item["title"],
                    "source_url": item["source_url"],
                    "part": item.get("part"),
                    "document_hash": None,
                    "status": "PENDING",
                    "error_message": None,
                    "pages_processed": 0,
                    "chunks_created": 0,
                    "embeddings_generated": 0,
                    "chroma_records": 0,
                    "skipped_duplicate": False,
                    "stage_detail": None,
                    "created_at": _now(),
                    "updated_at": _now(),
                }
            )
        _save_registry(rows)
        return rows
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def _save_registry(rows: list[dict]) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    REGISTRY_PATH.write_text(json.dumps(rows, indent=2), encoding="utf-8")


def _update_row(textbook_id: str, **fields) -> dict | None:
    rows = _load_registry()
    found = None
    for row in rows:
        if row["id"] == textbook_id:
            row.update(fields)
            row["updated_at"] = _now()
            found = row
            break
    _save_registry(rows)
    return found


def _get_collection():
    import chromadb
    from chromadb.config import Settings

    CHROMA_DIR.mkdir(parents=True, exist_ok=True)
    client = chromadb.PersistentClient(
        path=str(CHROMA_DIR),
        settings=Settings(anonymized_telemetry=False),
    )
    try:
        return client.get_or_create_collection(
            name=COLLECTION,
            metadata={"hnsw:space": "cosine"},
        )
    except Exception:
        return client.get_or_create_collection(name=COLLECTION)


def collection_count() -> int:
    try:
        return int(_get_collection().count())
    except Exception:
        return 0


def validate_url(url: str) -> str:
    raw = (url or "").strip()
    parsed = urlparse(raw)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError("Textbook URL must start with http:// or https://")
    host = (parsed.hostname or "").lower()
    if host in {"localhost", "127.0.0.1", "0.0.0.0"}:
        raise ValueError("Local textbook URLs are not allowed")
    return raw


def _filename(url: str) -> str:
    name = Path(unquote(urlparse(url).path)).name or "textbook.pdf"
    if not name.lower().endswith(".pdf"):
        name += ".pdf"
    return name


def _download(url: str) -> tuple[Path, str]:
    import urllib.request

    safe = validate_url(url)
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        safe,
        headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept": "application/pdf,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=300) as resp:
        data = resp.read(PDF_MAX_BYTES + 1)
    if len(data) > PDF_MAX_BYTES:
        raise ValueError("Textbook PDF is larger than the allowed size")
    if not data.startswith(b"%PDF"):
        raise ValueError("Downloaded file is not a valid PDF")
    digest = hashlib.sha256(data).hexdigest()
    path = PDF_DIR / f"{digest[:16]}_{_filename(safe)}"
    path.write_bytes(data)
    return path, digest


def _slug(value: str, fallback: str = "section") -> str:
    text = re.sub(r"[^a-z0-9]+", "_", (value or "").lower()).strip("_")
    return (text[:48] or fallback).strip("_") or fallback


def _paragraphs(text: str) -> list[str]:
    blocks = re.split(r"\n\s*\n+", text or "")
    out = []
    for block in blocks:
        compact = " ".join(block.split())
        if compact:
            out.append(compact)
    return out


def _chunk_pages(pages: list[dict], *, grade: int, textbook: str, source_url: str, source_name: str, document_hash: str) -> list[dict]:
    try:
        import ingest_textbooks as ingest

        chapters = ingest.load_chapters()
        chapter_lookup = ingest.chapter_for
    except Exception:
        chapters = []

        def chapter_lookup(*_args, **_kwargs):
            return None
    pdf_id = "part2" if re.search(r"p-?ii|part.?2|part ii", source_name, re.I) else "part1"
    chunks: list[dict] = []
    counters: dict[str, int] = {}
    chapter = ""
    section = ""
    for page_info in pages:
        page_no = int(page_info["page"])
        mapped = chapter_lookup(chapters, grade, pdf_id, page_no)
        if mapped:
            chapter = mapped.get("chapter_name") or chapter
        for paragraph in _paragraphs(page_info.get("text") or ""):
            heading = CHAPTER_RE.match(paragraph)
            numbered = SECTION_RE.match(paragraph)
            if heading and len(paragraph) < 140:
                chapter = (heading.group(2) or heading.group(4) or paragraph).strip()
                continue
            if numbered and len(paragraph) < 140:
                section = numbered.group(2).strip()
                continue
            pieces = [paragraph]
            if len(paragraph) > 1600:
                pieces = []
                cur = ""
                for sentence in SENTENCE_SPLIT.split(paragraph):
                    s = sentence.strip()
                    if not s:
                        continue
                    if cur and len(cur) + 1 + len(s) > 1600:
                        pieces.append(cur)
                        cur = s
                    else:
                        cur = f"{cur} {s}".strip() if cur else s
                if cur:
                    pieces.append(cur)
            for piece in pieces:
                if len(piece) < 180:
                    continue
                prefix = " — ".join([p for p in (chapter, section) if p])
                text = f"{prefix}. {piece}" if prefix and not piece.lower().startswith(prefix.lower()) else piece
                slug = _slug(chapter or "general")
                key = f"grade{grade}_{slug}_{page_no:03d}"
                counters[key] = counters.get(key, 0) + 1
                chunk_id = f"{key}_{counters[key]:03d}"
                meta = {
                    "grade": int(grade),
                    "subject": "Science",
                    "textbook": textbook,
                    "chapter": chapter or (mapped["chapter_name"] if mapped else "General"),
                    "unit": mapped["topic_id"] if mapped else "",
                    "section": section,
                    "page": page_no,
                    "chunk_id": chunk_id,
                    "source_url": source_url,
                    "source": source_name,
                    "document_hash": document_hash,
                    "content_type": "theory",
                }
                if mapped:
                    meta["chapter_id"] = mapped["chapter_id"]
                    meta["lesson_id"] = mapped["lesson_id"]
                    meta["topic_id"] = mapped["topic_id"]
                chunks.append({"id": chunk_id, "text": text, "metadata": meta})
    return chunks


def _extract_pages(pdf_path: Path) -> list[dict]:
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(str(pdf_path))
    except PdfReadError as exc:
        raise ValueError("The PDF could not be read (it may be corrupted)") from exc
    if len(reader.pages) > PDF_MAX_PAGES:
        raise ValueError("The PDF has too many pages to process safely")
    pages = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            raw = page.extract_text() or ""
        except Exception:
            raw = ""
        pages.append({"page": i, "text": raw})
    if not any(p["text"].strip() for p in pages):
        raise ValueError("No readable text was found in the PDF")
    return pages


def ingest_url(payload: dict) -> dict:
    grade = int(payload["grade"])
    source_url = validate_url(payload["source_url"])
    title = (payload.get("title") or f"Grade {grade} Science").strip()
    force = bool(payload.get("force"))
    textbook_id = payload.get("id")
    rows = _load_registry()
    row = next((r for r in rows if r["id"] == textbook_id), None) if textbook_id else None
    if row is None:
        row = next((r for r in rows if r["source_url"] == source_url), None)
    if row is None:
        row = {
            "id": str(uuid.uuid4()),
            "grade": grade,
            "subject": "Science",
            "title": title,
            "source_url": source_url,
            "part": payload.get("part"),
            "document_hash": None,
            "status": "PENDING",
            "error_message": None,
            "pages_processed": 0,
            "chunks_created": 0,
            "embeddings_generated": 0,
            "chroma_records": 0,
            "skipped_duplicate": False,
            "stage_detail": None,
            "created_at": _now(),
            "updated_at": _now(),
        }
        rows.append(row)
        _save_registry(rows)
    tid = row["id"]
    try:
        _update_row(tid, status="DOWNLOADING", stage_detail="Downloading PDF", error_message=None, grade=grade, title=title, source_url=source_url)
        path, digest = _download(source_url)
        existing = next(
            (
                r
                for r in _load_registry()
                if r.get("document_hash") == digest and r.get("status") in {"COMPLETED", "SKIPPED"} and r["id"] != tid
            ),
            None,
        )
        if existing and not force:
            return _update_row(
                tid,
                status="SKIPPED",
                document_hash=digest,
                skipped_duplicate=True,
                stage_detail="Already indexed (same document hash)",
                chroma_records=collection_count(),
            )
        if row.get("document_hash") == digest and row.get("status") == "COMPLETED" and not force:
            return _update_row(
                tid,
                status="SKIPPED",
                skipped_duplicate=True,
                stage_detail="This textbook is already indexed",
                chroma_records=collection_count(),
            )
        _update_row(tid, status="EXTRACTING", document_hash=digest, stage_detail="Extracting page text")
        pages = _extract_pages(path)
        nonempty = sum(1 for p in pages if p["text"].strip())
        _update_row(tid, status="CHUNKING", pages_processed=nonempty, stage_detail=f"Creating chunks ({nonempty} pages)")
        chunks = _chunk_pages(
            pages,
            grade=grade,
            textbook=title,
            source_url=source_url,
            source_name=_filename(source_url),
            document_hash=digest,
        )
        if not chunks:
            raise ValueError("No usable Science chunks were created from this PDF")
        _update_row(tid, status="EMBEDDING", chunks_created=len(chunks), stage_detail=f"Generating embeddings for {len(chunks)} chunks")
        col = _get_collection()
        try:
            existing_ids = col.get(where={"document_hash": digest}, include=[]).get("ids") or []
            if existing_ids:
                col.delete(ids=existing_ids)
        except Exception:
            pass
        batch = 48
        embedded = 0
        for start in range(0, len(chunks), batch):
            group = chunks[start : start + batch]
            col.add(
                ids=[c["id"] for c in group],
                documents=[c["text"] for c in group],
                metadatas=[c["metadata"] for c in group],
            )
            embedded += len(group)
            _update_row(
                tid,
                status="INDEXING",
                embeddings_generated=embedded,
                chroma_records=collection_count(),
                stage_detail=f"Saving to ChromaDB ({embedded}/{len(chunks)})",
            )
        return _update_row(
            tid,
            status="COMPLETED",
            document_hash=digest,
            pages_processed=nonempty,
            chunks_created=len(chunks),
            embeddings_generated=embedded,
            chroma_records=collection_count(),
            skipped_duplicate=False,
            error_message=None,
            stage_detail="Completed",
        )
    except Exception as exc:
        return _update_row(
            tid,
            status="FAILED",
            error_message=str(exc),
            stage_detail="Failed",
        )


def process_question(question: str) -> dict:
    original = (question or "").strip()
    cleaned = re.sub(r"\[?\s*_+\s*\]?", " ", original)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    tokens = [t for t in re.findall(r"[a-z0-9]+", cleaned.lower()) if t not in STOP and len(t) > 1]
    extras: list[str] = []
    blob = f" {cleaned.lower()} "
    for needle, hints in HINTS:
        if re.search(rf"\b{re.escape(needle)}", blob):
            extras.extend(hints)
    keywords = list(dict.fromkeys(tokens + extras))
    return {
        "original_question": original,
        "retrieval_query": " ".join(keywords) if keywords else cleaned or original,
        "keywords": keywords,
    }


_EXERCISE_RE = re.compile(
    r"\[?\s*_{2,}\s*\]?|\[\s*_{0,4}\s*\]|\bactivity\s+\d|\blet us do\b|\bfill in the blank|\bexercise\s+\d",
    re.I,
)


def _is_exercise(text: str) -> bool:
    """Worksheet stems are not explanations. Do not retrieve them as textbook context."""
    return bool(_EXERCISE_RE.search(text or ""))


def _keyword_score(query: str, document: str) -> float:
    terms = [t for t in re.findall(r"[a-z0-9]+", query.lower()) if len(t) > 2]
    if not terms:
        return 0.0
    doc = f" {document.lower()} "
    hits = 0.0
    for term in terms:
        count = len(re.findall(rf"\b{re.escape(term)}\b", doc))
        if count:
            hits += 1.0 + min(count - 1, 3) * 0.15
    return min(1.0, hits / max(len(terms), 1))


def _scope_ids(payload: dict | None) -> tuple[str, str]:
    data = payload or {}
    chapter_id = str(data.get("chapter_id") or data.get("chapterId") or "").strip()
    topic_id = str(data.get("topic_id") or data.get("topicId") or "").strip()
    return chapter_id, topic_id


def _where(
    grade: int | None,
    subject: str = "Science",
    chapter_id: str | None = None,
    topic_id: str | None = None,
) -> dict | None:
    """
    Semantic search stays inside the question's chapter when ids are known.

    where={"chapter_id": question_chapter_id} and/or {"topic_id": question_topic_id}
    """
    clauses = []
    if grade is not None:
        clauses.append({"grade": int(grade)})
    if subject:
        clauses.append({"subject": subject})
    cid = str(chapter_id or "").strip()
    tid = str(topic_id or "").strip()
    if cid:
        clauses.append({"chapter_id": cid})
    if tid:
        clauses.append({"topic_id": tid})
    if not clauses:
        return None
    if len(clauses) == 1:
        return clauses[0]
    return {"$and": clauses}


def _answer_terms(correct_answer: str) -> list[str]:
    tokens = re.findall(r"[a-z0-9]+", (correct_answer or "").lower())
    kept = []
    for token in tokens:
        if token in ("true", "false") or (len(token) > 2 and token not in STOP):
            if token not in kept:
                kept.append(token)
    return kept


def prefer_answer_chunks(hits: list[dict], answer_terms: list[str]) -> list[dict]:
    """Re-rank retrieved chunks so correct-answer terms outweigh the question wording."""
    if not answer_terms:
        return list(hits or [])
    query = " ".join(answer_terms)
    ranked = []
    seen = set()
    for hit in hits or []:
        chunk_id = hit.get("chunk_id")
        if not hit.get("text") or chunk_id in seen:
            continue
        seen.add(chunk_id)
        coverage = _keyword_score(query, hit["text"])
        if coverage <= 0:
            continue
        hybrid = float(hit.get("hybrid_score") or 0)
        ranked.append({
            **hit,
            "answer_keyword_score": coverage,
            "hybrid_score": min(1.0, 0.40 * hybrid + 0.60 * coverage),
        })
    ranked.sort(key=lambda row: (row["answer_keyword_score"], row["hybrid_score"]), reverse=True)
    return ranked


def query_chunks(payload: dict) -> dict:
    processed = process_question(payload.get("question") or "")
    correct_answer = str(payload.get("correct_answer") or payload.get("correctAnswer") or "").strip()
    answer_terms = _answer_terms(correct_answer)
    grade = int(payload["grade"])
    top_k = int(payload.get("top_k") or 8)
    threshold = float(payload.get("min_relevance") if payload.get("min_relevance") is not None else RAG_MIN_RELEVANCE)
    chapter_id, topic_id = _scope_ids(payload)
    scoped = bool(chapter_id or topic_id)
    col = _get_collection()
    count = int(col.count())
    if count == 0:
        return {
            **processed,
            "chunks": [],
            "confidence": 0.0,
            "enough": False,
            "threshold": threshold,
            "used_cross_grade": False,
            "collection_count": 0,
            "chapter_id": chapter_id,
            "topic_id": topic_id,
        }

    def search(where, n, role, query_text=None):
        query_text = query_text or processed["retrieval_query"]
        kwargs = {
            "query_texts": [query_text],
            "n_results": max(1, n),
            "include": ["documents", "metadatas", "distances"],
        }
        if where:
            kwargs["where"] = where
        try:
            raw = col.query(**kwargs)
        except Exception:
            # A chapter filter must not fall back to the whole textbook.
            if scoped:
                return []
            kwargs.pop("where", None)
            raw = col.query(**kwargs)
        ids = (raw.get("ids") or [[]])[0]
        docs = (raw.get("documents") or [[]])[0]
        metas = (raw.get("metadatas") or [[]])[0]
        dists = (raw.get("distances") or [[]])[0]
        hits = []
        for i, cid in enumerate(ids):
            text = docs[i] if i < len(docs) else ""
            meta = metas[i] if i < len(metas) else {}
            distance = dists[i] if i < len(dists) else None
            similarity = max(0.0, min(1.0, 1.0 - float(distance))) if isinstance(distance, (int, float)) else 0.0
            if _is_exercise(text):
                continue
            keyword = _keyword_score(query_text, text)
            hybrid = 0.72 * similarity + 0.28 * keyword
            hits.append(
                {
                    "chunk_id": str(meta.get("chunk_id") or cid),
                    "text": text,
                    "similarity": similarity,
                    "keyword_score": keyword,
                    "hybrid_score": hybrid,
                    "grade": meta.get("grade"),
                    "subject": meta.get("subject") or "Science",
                    "textbook": meta.get("textbook") or f"Grade {meta.get('grade')} Science",
                    "chapter": meta.get("chapter") or "",
                    "chapter_id": meta.get("chapter_id") or "",
                    "topic_id": meta.get("topic_id") or "",
                    "unit": meta.get("unit") or "",
                    "page": meta.get("page"),
                    "source_url": meta.get("source_url") or "",
                    "document_hash": meta.get("document_hash") or "",
                    "role": role,
                }
            )
        return hits

    fetch_n = max(24, top_k * 3)
    primary = search(_where(grade, "Science", chapter_id, topic_id), fetch_n, "primary")
    # Chunks always store both ids when mapped. If an older row has only one, stay inside that id.
    if scoped and not primary and chapter_id and topic_id:
        primary = search(_where(grade, "Science", chapter_id, None), fetch_n, "primary")
    if scoped and not primary and topic_id:
        primary = search(_where(grade, "Science", None, topic_id), fetch_n, "primary")
    confident = [h for h in primary if h["hybrid_score"] >= threshold]
    supporting = []
    used_cross = False
    if not scoped and len(confident) < 3:
        used_cross = True
        for other in (6, 7, 8, 9):
            if other == grade:
                continue
            supporting.extend(search(_where(other), max(6, top_k), "supporting"))
    merged = []
    seen = set()
    for hit in sorted(primary + supporting, key=lambda h: h["hybrid_score"], reverse=True):
        if hit["chunk_id"] in seen or not hit["text"]:
            continue
        seen.add(hit["chunk_id"])
        merged.append(hit)
    selected = [h for h in merged if h["hybrid_score"] >= threshold][:top_k]
    if scoped:
        selected = [
            h
            for h in selected
            if (not chapter_id or not h.get("chapter_id") or h.get("chapter_id") == chapter_id)
            and (not topic_id or not h.get("topic_id") or h.get("topic_id") == topic_id)
            and (h.get("chapter_id") or h.get("topic_id"))
        ]
    confidence = selected[0]["hybrid_score"] if selected else 0.0
    answer_weighted = False
    if answer_terms and (not selected or confidence < threshold):
        answer_query = " ".join(
            answer_terms + [term for term in processed["keywords"] if term not in answer_terms][:6]
        )
        answer_hits = search(
            _where(grade, "Science", chapter_id, topic_id),
            fetch_n,
            "answer",
            answer_query,
        )
        preferred = prefer_answer_chunks(answer_hits + primary + supporting, answer_terms)
        if scoped:
            preferred = [
                hit
                for hit in preferred
                if (not chapter_id or not hit.get("chapter_id") or hit.get("chapter_id") == chapter_id)
                and (not topic_id or not hit.get("topic_id") or hit.get("topic_id") == topic_id)
                and (hit.get("chapter_id") or hit.get("topic_id"))
            ]
        if preferred:
            selected = preferred[:top_k]
            confidence = selected[0]["hybrid_score"]
            answer_weighted = True
    return {
        **processed,
        "correct_answer": correct_answer,
        "answer_weighted": answer_weighted,
        "chunks": selected,
        "confidence": confidence,
        "enough": bool(selected) and confidence >= threshold,
        "threshold": threshold,
        "used_cross_grade": used_cross and any(h["role"] == "supporting" for h in selected),
        "collection_count": count,
        "primary_grade": grade,
        "chapter_id": chapter_id,
        "topic_id": topic_id,
    }


def ingest_defaults(payload: dict) -> dict:
    force = bool(payload.get("force"))
    count = collection_count()
    if not force and count >= 100:
        return {
            "textbooks": _load_registry(),
            "chroma": {"collection": COLLECTION, "count": count},
            "skipped": True,
        }
    results = []
    for book in DEFAULT_BOOKS:
        results.append(ingest_url({ **book, "source_url": book["source_url"], "force": force }))
    return {"textbooks": results, "chroma": {"collection": COLLECTION, "count": collection_count()}}


def dispatch(op: str, payload: dict):
    if op == "ping":
        return {"ok": True, "collection": COLLECTION, "count": collection_count()}
    if op == "list":
        grade = payload.get("grade")
        rows = _load_registry()
        if grade is not None:
            rows = [r for r in rows if int(r["grade"]) == int(grade)]
        return {"textbooks": rows, "chroma": {"collection": COLLECTION, "count": collection_count()}}
    if op == "ingest":
        return ingest_url(payload)
    if op == "ingest_defaults":
        return ingest_defaults(payload)
    if op == "query":
        return query_chunks(payload)
    if op == "count":
        return {"count": collection_count(), "collection": COLLECTION}
    raise ValueError(f"unknown op {op}")


def worker() -> None:
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        req = json.loads(line)
        try:
            result = dispatch(req.get("op"), req.get("payload") or {})
            sys.stdout.write(json.dumps({"id": req.get("id"), "ok": True, "result": result}) + "\n")
        except Exception as exc:
            sys.stdout.write(json.dumps({"id": req.get("id"), "ok": False, "error": str(exc)}) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "worker":
        worker()
    else:
        raw = sys.stdin.read()
        req = json.loads(raw or "{}")
        try:
            result = dispatch(req.get("op"), req.get("payload") or {})
            json.dump({"ok": True, "result": result}, sys.stdout)
        except Exception as exc:
            json.dump({"ok": False, "error": str(exc)}, sys.stdout)
            sys.exit(1)
