"""
Ingest EduPub Grade 6–9 Science PDFs into Sage textbook chunks.

Chunking matches the assessment engine:
  900-character windows, 150 overlap, drop < 80 chars,
  tag by official chapter page ranges (1-based PDF pages, per file).

Usage (from gaming-service repo root):
  python scripts/ingest_textbooks.py
  DIGEST_ONLY=1 python scripts/ingest_textbooks.py   # rebuild chapter sentences from existing chunks

Looks for PDFs in:
  1. GAMING_TEXTBOOK_DIR / data/textbooks
  2. ../intelligent-assessment-engine/data  (read-only, local copies)
  3. Optional download from EduPub URLs in curriculumChapters.mjs (set DOWNLOAD=1)
"""
from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

try:
    from pypdf import PdfReader
except ImportError:
    print("Install pypdf first:  pip install pypdf", file=sys.stderr)
    raise

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "backend" / "lib" / "textbookChunks.json"
DIGEST_BACKEND = ROOT / "backend" / "lib" / "textbookChapterDigest.json"
DIGEST_FRONTEND = ROOT / "frontend" / "src" / "avatar" / "textbookChapterDigest.json"
CHUNK_SIZE = 900
CHUNK_OVERLAP = 150
MIN_CHARS = 80

# Keep in sync with backend/lib/curriculumChapters.mjs
SOURCES = [
    {
        "grade": 6,
        "pdf_id": "part1",
        "local": ["science G-6 E.pdf", "grade_6_science.pdf"],
        "url": "http://www.edupub.gov.lk/Administrator/English/6/science%20G-6%20%20E/science%20G-6%20E.pdf",
    },
    {
        "grade": 7,
        "pdf_id": "part1",
        "local": ["science G-7 P-I E.pdf", "grade_7_science_part1.pdf"],
        "url": "http://www.edupub.gov.lk/Administrator/English/7/science%20G-7%20P-I%20E/science%20G-7%20P-I%20E.pdf",
    },
    {
        "grade": 7,
        "pdf_id": "part2",
        "local": ["science G-7 P-II E.pdf", "grade_7_science_part2.pdf"],
        "url": "",
    },
    {
        "grade": 8,
        "pdf_id": "part1",
        "local": ["science G8 P-I E.pdf", "grade_8_science_part1.pdf"],
        "url": "http://www.edupub.gov.lk/Administrator/English/8/science%20G-8%20P-I%20E/science%20G8%20P-I%20E.pdf",
    },
    {
        "grade": 8,
        "pdf_id": "part2",
        "local": ["science G-8 P-II E.pdf", "grade_8_science_part2.pdf"],
        "url": "http://www.edupub.gov.lk/Administrator/English/8/science%20G-8%20P-II%20E/science%20G-8%20P-II%20E.pdf",
    },
    {
        "grade": 9,
        "pdf_id": "part1",
        "local": ["science G-9 P-I E.pdf", "grade_9_science_part1.pdf"],
        "url": "http://www.edupub.gov.lk/Administrator/English/9/science%20G-9%20P-I%20E/science%20G-9%20P-I%20E.pdf",
    },
    {
        "grade": 9,
        "pdf_id": "part2",
        "local": ["Science Part II English G-9.pdf", "grade_9_science_part2.pdf"],
        "url": "http://www.edupub.gov.lk/Administrator/English/9/science%20G-9%20P-II%20E/Science%20Part%20II%20English%20G-9.pdf",
    },
]


def load_chapters() -> list[dict]:
    text = (ROOT / "backend" / "lib" / "curriculumChapters.mjs").read_text(encoding="utf-8")
    block = text.split("export const CURRICULUM_CHAPTERS = [", 1)[1].split("];", 1)[0]
    rows = []
    for m in re.finditer(r"\{([^}]+)\}", block):
        body = m.group(1)
        def grab(key, cast=str):
            mm = re.search(rf"{key}:\s*('[^']+'|\d+)", body)
            if not mm:
                return None
            raw = mm.group(1)
            if raw.startswith("'"):
                return raw[1:-1]
            return cast(raw)
        rows.append({
            "grade": int(grab("grade", int)),
            "chapter_id": grab("chapter_id"),
            "lesson_id": grab("lesson_id"),
            "topic_id": grab("topic_id"),
            "chapter_name": grab("chapter_name"),
            "pdf_id": grab("pdf_id"),
            "page_start": int(grab("page_start", int)),
            "page_end": int(grab("page_end", int)),
        })
    return rows


def search_dirs() -> list[Path]:
    dirs = []
    env = os.environ.get("GAMING_TEXTBOOK_DIR")
    if env:
        dirs.append(Path(env))
    dirs.append(ROOT / "data" / "textbooks")
    dirs.append(ROOT.parent / "intelligent-assessment-engine" / "data")
    return dirs


def find_pdf(source: dict) -> Path | None:
    for folder in search_dirs():
        if not folder.is_dir():
            continue
        for name in source["local"]:
            path = folder / name
            if path.is_file():
                return path
    return None


def download_pdf(source: dict, dest_dir: Path) -> Path | None:
    url = source.get("url") or ""
    if not url:
        return None
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / source["local"][0]
    print(f"download {url}")
    urllib.request.urlretrieve(url, dest)
    return dest if dest.is_file() else None


def chunk_text(text: str) -> list[str]:
    cleaned = " ".join(text.split())
    if not cleaned:
        return []
    out = []
    start = 0
    while start < len(cleaned):
        end = min(start + CHUNK_SIZE, len(cleaned))
        piece = cleaned[start:end].strip()
        if piece:
            out.append(piece)
        if end >= len(cleaned):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return out


def chapter_for(chapters: list[dict], grade: int, pdf_id: str, page: int) -> dict | None:
    for ch in chapters:
        if ch["grade"] == grade and ch["pdf_id"] == pdf_id and ch["page_start"] <= page <= ch["page_end"]:
            return ch
    return None


SENTENCE_SKIP = re.compile(
    r"^(activity|assignment|exercise|fig\.|figure|table|complete the|let'?s do|you will learn|for your extra|copy the|what can you|y )",
    re.I,
)


def teachable_sentences(text: str) -> list[str]:
    blob = re.sub(r"\s+", " ", text or "").replace("•", ". ").replace("²", ". ").strip()
    parts = re.split(r"(?<=[.?!])\s+", blob)
    scored: list[tuple[int, str]] = []
    seen: set[str] = set()
    for raw in parts:
        s = re.sub(r"^[\d\s|]+", "", raw)
        s = re.sub(r"^(Science\s*\|\s*)+", "", s, flags=re.I).strip()
        s = re.sub(r"^\.\d+\s*", "", s).strip()
        if len(s) < 52 or len(s) > 200:
            continue
        if SENTENCE_SKIP.search(s):
            continue
        if s.endswith("?"):
            continue
        if re.search(r"'{6,}|_{4,}|\^\{|…{2,}|\.{6,}", s):
            continue
        if s.count("|") >= 1:
            continue
        if not re.search(r"[A-Za-z]{4,}", s):
            continue
        if not re.search(r"\b(is|are|has|have|called|known|takes|take|helps|consist|consists)\b", s, re.I):
            continue
        key = s[:90].lower()
        if key in seen:
            continue
        seen.add(key)
        score = 0
        if re.search(r"\bis called\b|\bare called\b|\bknown as\b|\bthis process\b", s, re.I):
            score += 4
        if re.search(
            r"\b(photosynthesis|transpiration|pollination|evaporation|chlorophyll|stomata|xylem|phloem)\b",
            s,
            re.I,
        ):
            score += 2
        scored.append((score, s))
    scored.sort(key=lambda row: (-row[0], len(row[1])))
    return [s for _, s in scored[:10]]


def build_digest(chunks: list[dict]) -> list[dict]:
    grouped: dict[str, dict] = {}
    for chunk in chunks:
        cid = chunk["chapter_id"]
        if cid not in grouped:
            grouped[cid] = {
                "grade": chunk["grade"],
                "chapter_id": cid,
                "lesson_id": chunk.get("lesson_id", ""),
                "topic_id": chunk.get("topic_id", ""),
                "chapter_name": chunk.get("chapter_name", ""),
                "texts": [],
            }
        grouped[cid]["texts"].append(chunk.get("text") or "")
    digest = []
    for row in grouped.values():
        blob = " ".join(row.pop("texts"))
        digest.append({**row, "sentences": teachable_sentences(blob)})
    digest.sort(key=lambda r: (r["grade"], r["chapter_id"]))
    return digest


def ingest() -> list[dict]:
    chapters = load_chapters()
    download = os.environ.get("DOWNLOAD") == "1"
    dest_dir = ROOT / "data" / "textbooks"
    records: list[dict] = []
    idx = 0
    for source in SOURCES:
        path = find_pdf(source)
        if path is None and download:
            path = download_pdf(source, dest_dir)
        if path is None:
            print(f"skip missing PDF grade={source['grade']} {source['pdf_id']}")
            continue
        print(f"read {path}")
        reader = PdfReader(str(path))
        for page_i, page in enumerate(reader.pages, start=1):
            ch = chapter_for(chapters, source["grade"], source["pdf_id"], page_i)
            if ch is None:
                continue
            raw = page.extract_text() or ""
            for piece in chunk_text(raw):
                if len(piece) < MIN_CHARS:
                    continue
                idx += 1
                records.append({
                    "id": f"{ch['chapter_id']}::p{page_i}::c{idx}",
                    "text": piece,
                    "grade": ch["grade"],
                    "chapter_id": ch["chapter_id"],
                    "lesson_id": ch["lesson_id"],
                    "topic_id": ch["topic_id"],
                    "chapter_name": ch["chapter_name"],
                    "pdf_id": source["pdf_id"],
                    "page_start": page_i,
                    "page_end": page_i,
                    "source": path.name,
                })
    return records


def write_digest(chunks: list[dict]) -> list[dict]:
    digest = build_digest(chunks)
    payload = json.dumps(digest, ensure_ascii=False, indent=2)
    for dest in (DIGEST_BACKEND, DIGEST_FRONTEND):
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(payload, encoding="utf-8")
        print(f"wrote {len(digest)} chapter digests -> {dest}")
    return digest


def main() -> None:
    if os.environ.get("DIGEST_ONLY") == "1" and OUT.is_file():
        chunks = json.loads(OUT.read_text(encoding="utf-8"))
        write_digest(chunks)
        return
    rows = ingest()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(rows)} chunks -> {OUT}")
    write_digest(rows)


if __name__ == "__main__":
    main()
