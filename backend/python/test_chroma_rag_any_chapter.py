"""RAG searches all ingested chapters. Grade + Science filter only."""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
os.environ.setdefault("CHROMA_PERSIST_DIR", str(Path(tempfile.mkdtemp()) / "chroma"))
os.environ.setdefault("CHROMA_MINDMAP_COLLECTION", "science_textbooks_test")

from chroma_ops import _get_collection, _where, query_chunks  # noqa: E402


CHAPTER_CHUNKS = [
    {
        "id": "g7-plant-diversity",
        "text": "Flowering plants are grouped as monocotyledons and dicotyledons according to seed structure.",
        "meta": {
            "chunk_id": "g7-plant-diversity",
            "grade": 7,
            "subject": "Science",
            "textbook": "Grade 7 Science Part I",
            "chapter": "Plant Diversity",
            "page": 18,
        },
    },
    {
        "id": "g6-magnets",
        "text": "A magnet has a north pole and a south pole. Unlike poles attract each other.",
        "meta": {
            "chunk_id": "g6-magnets",
            "grade": 6,
            "subject": "Science",
            "textbook": "Grade 6 Science",
            "chapter": "Magnets",
            "page": 114,
        },
    },
    {
        "id": "g8-electricity",
        "text": "A closed electric circuit lets current flow from the cell through the bulb and back.",
        "meta": {
            "chunk_id": "g8-electricity",
            "grade": 8,
            "subject": "Science",
            "textbook": "Grade 8 Science Part II",
            "chapter": "Electricity",
            "page": 32,
        },
    },
    {
        "id": "g9-density",
        "text": "Density is the mass of a substance divided by its volume.",
        "meta": {
            "chunk_id": "g9-density",
            "grade": 9,
            "subject": "Science",
            "textbook": "Grade 9 Science Part II",
            "chapter": "Density",
            "page": 24,
        },
    },
]

QUERIES = [
    (7, "Name the two main groups of flowering plants based on seed structure.", "Plant Diversity"),
    (6, "What are the poles of a magnet?", "Magnets"),
    (8, "What is a closed electric circuit?", "Electricity"),
    (9, "What is density?", "Density"),
]


def seed_collection():
    col = _get_collection()
    col.add(
        ids=[row["id"] for row in CHAPTER_CHUNKS],
        documents=[row["text"] for row in CHAPTER_CHUNKS],
        metadatas=[row["meta"] for row in CHAPTER_CHUNKS],
    )
    return col.count()


def test_where_has_no_chapter_clause():
    blob = str(_where(7, "Science")).lower()
    assert "chapter" not in blob
    assert "grade" in blob
    assert "science" in blob


def test_each_chapter_question_retrieves_its_own_chunk():
    count = seed_collection()
    assert count >= 4
    for grade, question, chapter in QUERIES:
        result = query_chunks({"grade": grade, "question": question, "top_k": 4})
        assert result["enough"] is True, (question, result)
        chapters = [c.get("chapter") for c in result["chunks"]]
        assert chapter in chapters, {
            "question": question,
            "expected": chapter,
            "got": chapters,
            "query": result.get("retrieval_query"),
        }


if __name__ == "__main__":
    test_where_has_no_chapter_clause()
    test_each_chapter_question_retrieves_its_own_chunk()
    print("ok")
