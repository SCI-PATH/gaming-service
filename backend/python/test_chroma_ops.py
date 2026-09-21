"""process_question and URL checks do not need chromadb."""

from chroma_ops import process_question, validate_url


def test_process_question_expands_photosynthesis_hints():
    out = process_question("Why do plants need sunlight?")
    assert "sunlight" in out["retrieval_query"]
    assert "photosynthesis" in out["retrieval_query"]
    assert out["original_question"].startswith("Why")


def test_validate_url_rejects_local():
    try:
        validate_url("http://localhost/book.pdf")
        raise AssertionError("expected local URL to fail")
    except ValueError:
        pass


if __name__ == "__main__":
    test_process_question_expands_photosynthesis_hints()
    test_validate_url_rejects_local()
    print("ok")
