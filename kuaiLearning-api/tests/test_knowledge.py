from app.core.config import Settings
from app.services.knowledge import _normalize_text, _split_pages


def test_document_text_is_normalized_and_split_with_page_numbers() -> None:
    text = _normalize_text("第一段。\r\n\r\n\r\n第二段。   第三段。")
    chunks = _split_pages([(12, text * 30)], size=200, overlap=30)

    assert len(chunks) > 1
    assert all(page == 12 for page, _content in chunks)
    assert all(content.strip() == content for _page, content in chunks)
    assert all(len(content) <= 200 for _page, content in chunks)


def test_chunk_overlap_must_be_smaller_than_chunk_size() -> None:
    try:
        Settings(knowledge_chunk_chars=200, knowledge_chunk_overlap=200)
    except ValueError as error:
        assert "KNOWLEDGE_CHUNK_OVERLAP" in str(error)
    else:
        raise AssertionError("invalid chunk configuration was accepted")
