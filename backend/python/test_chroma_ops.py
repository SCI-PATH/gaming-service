"""process_question and URL checks do not need chromadb."""

from chroma_ops import process_question, validate_url, _where


def test_process_question_expands_photosynthesis_hints():
    out = process_question("Why do plants need sunlight?")
    assert "sunlight" in out["retrieval_query"]
    assert "photosynthesis" in out["retrieval_query"]
    assert out["original_question"].startswith("Why")


def test_process_question_strips_fill_in_blanks():
    out = process_question(
        "Plant leaves come in various [____], [____], and [____], which contribute to photosynthesis."
    )
    assert "____" not in out["retrieval_query"]
    assert "leaves" in out["retrieval_query"]
    assert "photosynthesis" in out["retrieval_query"]


def test_process_question_expands_monocot_hints():
    out = process_question("Which of the following statements is true about monocotyledonous plants?")
    assert "monocot" in out["retrieval_query"]
    assert "cotyledon" in out["retrieval_query"]


def test_validate_url_rejects_local():
    try:
        validate_url("http://localhost/book.pdf")
        raise AssertionError("expected local URL to fail")
    except ValueError:
        pass


def test_rag_filter_is_grade_and_subject_until_ids_are_known():
    open_where = _where(8, "Science")
    blob = str(open_where)
    assert "grade" in blob
    assert "Science" in blob
    assert "chapter" not in blob.lower()
    scoped = _where(8, "Science", chapter_id="G8_C10", topic_id="G8_S10_ELE_CIRCUIT")
    scoped_blob = str(scoped)
    assert "G8_C10" in scoped_blob
    assert "G8_S10_ELE_CIRCUIT" in scoped_blob
    assert "chapter_id" in scoped_blob
    assert "topic_id" in scoped_blob


if __name__ == "__main__":
    test_process_question_expands_photosynthesis_hints()
    test_process_question_strips_fill_in_blanks()
    test_process_question_expands_monocot_hints()
    test_validate_url_rejects_local()
    test_rag_filter_is_grade_and_subject_until_ids_are_known()
    print("ok")
