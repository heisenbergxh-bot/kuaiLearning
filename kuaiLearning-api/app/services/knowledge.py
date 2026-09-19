import asyncio
import logging
import re
from collections.abc import Iterable
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx
import pymupdf as fitz
from fastembed import TextEmbedding
from sqlalchemy import delete, select

from app.core.config import Settings
from app.db.session import SessionFactory
from app.models import KnowledgeChunk, KnowledgeSource
from app.schemas.knowledge import KnowledgeSearchHit

logger = logging.getLogger(__name__)


@lru_cache(maxsize=2)
def _embedding_model(model_name: str, cache_dir: str) -> TextEmbedding:
    return TextEmbedding(model_name=model_name, cache_dir=cache_dir, threads=1, lazy_load=True)


async def _embed(texts: list[str], settings: Settings) -> list[list[float]]:
    def run() -> list[list[float]]:
        return [
            vector.tolist()
            for vector in _embedding_model(
                settings.embedding_model, settings.embedding_cache_dir
            ).embed(texts)
        ]

    return await asyncio.to_thread(run)


def _normalize_text(value: str) -> str:
    value = value.replace("\x00", " ").replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def _read_document(path: Path) -> list[tuple[int | None, str]]:
    if path.suffix.lower() == ".pdf":
        document = fitz.open(path)
        try:
            return [
                (page_number, text)
                for page_number, page in enumerate(document, start=1)
                if (text := _normalize_text(page.get_text("text")))
            ]
        finally:
            document.close()
    raw = path.read_bytes()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = raw.decode("gb18030")
    normalized = _normalize_text(text)
    return [(None, normalized)] if normalized else []


def _split_pages(
    pages: Iterable[tuple[int | None, str]], *, size: int, overlap: int
) -> list[tuple[int | None, str]]:
    chunks: list[tuple[int | None, str]] = []
    for page_number, text in pages:
        start = 0
        while start < len(text):
            end = min(len(text), start + size)
            if end < len(text):
                boundary = max(
                    text.rfind("\n", start + size // 2, end),
                    text.rfind("。", start, end),
                )
                if boundary > start:
                    end = boundary + 1
            content = text[start:end].strip()
            if content:
                chunks.append((page_number, content))
            if end >= len(text):
                break
            start = max(start + 1, end - overlap)
    return chunks


def _meili_headers(settings: Settings) -> dict[str, str]:
    key = settings.meilisearch_api_key.get_secret_value()
    return {"Authorization": f"Bearer {key}"} if key else {}


async def _ensure_indexes(settings: Settings, http: httpx.AsyncClient) -> None:
    qdrant = settings.qdrant_url.rstrip("/")
    collection_url = f"{qdrant}/collections/{settings.qdrant_collection}"
    response = await http.get(collection_url)
    if response.status_code == 404:
        response = await http.put(
            collection_url,
            json={
                "vectors": {
                    "size": settings.embedding_dimensions,
                    "distance": "Cosine",
                    "on_disk": True,
                },
                "on_disk_payload": True,
            },
        )
    response.raise_for_status()

    meili = settings.meilisearch_url.rstrip("/")
    headers = _meili_headers(settings)
    response = await http.post(
        f"{meili}/indexes",
        headers=headers,
        json={"uid": settings.meilisearch_knowledge_index, "primaryKey": "id"},
    )
    if response.status_code not in {200, 201, 202, 409}:
        response.raise_for_status()
    response = await http.put(
        f"{meili}/indexes/{settings.meilisearch_knowledge_index}/settings/filterable-attributes",
        headers=headers,
        json=["workspace_id", "source_id"],
    )
    response.raise_for_status()


async def _index_chunks(
    source: KnowledgeSource, chunks: list[KnowledgeChunk], settings: Settings
) -> None:
    async with httpx.AsyncClient(timeout=60) as http:
        await _ensure_indexes(settings, http)
        for start in range(0, len(chunks), 64):
            batch = chunks[start : start + 64]
            vectors = await _embed([chunk.content for chunk in batch], settings)
            if vectors and len(vectors[0]) != settings.embedding_dimensions:
                raise RuntimeError("Embedding model dimensions do not match configuration")
            points = [
                {
                    "id": chunk.id,
                    "vector": vector,
                    "payload": {
                        "workspace_id": chunk.workspace_id,
                        "source_id": chunk.source_id,
                        "page_number": chunk.page_number,
                    },
                }
                for chunk, vector in zip(batch, vectors, strict=True)
            ]
            response = await http.put(
                f"{settings.qdrant_url.rstrip('/')}/collections/"
                f"{settings.qdrant_collection}/points?wait=true",
                json={"points": points},
            )
            response.raise_for_status()
            response = await http.post(
                f"{settings.meilisearch_url.rstrip('/')}/indexes/"
                f"{settings.meilisearch_knowledge_index}/documents?primaryKey=id",
                headers=_meili_headers(settings),
                json=[
                    {
                        "id": chunk.id,
                        "workspace_id": chunk.workspace_id,
                        "source_id": chunk.source_id,
                        "source_title": source.title,
                        "page_number": chunk.page_number,
                        "content": chunk.content,
                    }
                    for chunk in batch
                ],
            )
            response.raise_for_status()


async def process_source(source_id: str, settings: Settings) -> None:
    try:
        async with SessionFactory() as session:
            source = await session.get(KnowledgeSource, source_id)
            if source is None:
                return
            source.status = "processing"
            source.error_message = None
            await session.commit()
            pages = await asyncio.to_thread(_read_document, Path(source.storage_path))
            pieces = _split_pages(
                pages,
                size=settings.knowledge_chunk_chars,
                overlap=settings.knowledge_chunk_overlap,
            )
            if not pieces:
                raise ValueError("未检测到可检索文字；如果这是扫描版 PDF，需要先启用 OCR")
            await session.execute(
                delete(KnowledgeChunk).where(KnowledgeChunk.source_id == source.id)
            )
            chunks = [
                KnowledgeChunk(
                    source_id=source.id,
                    workspace_id=source.workspace_id,
                    chunk_index=index,
                    page_number=page_number,
                    content=content,
                    char_count=len(content),
                )
                for index, (page_number, content) in enumerate(pieces)
            ]
            session.add_all(chunks)
            await session.flush()
            await _index_chunks(source, chunks, settings)
            source.status = "ready"
            source.chunk_count = len(chunks)
            await session.commit()
    except Exception as error:
        logger.exception("Knowledge source processing failed", extra={"source_id": source_id})
        async with SessionFactory() as session:
            source = await session.get(KnowledgeSource, source_id)
            if source is not None:
                source.status = "failed"
                source.error_message = str(error)[:1000]
                await session.commit()


async def delete_external_chunks(source_id: str, settings: Settings) -> None:
    async with httpx.AsyncClient(timeout=30) as http:
        try:
            await http.post(
                f"{settings.qdrant_url.rstrip('/')}/collections/"
                f"{settings.qdrant_collection}/points/delete?wait=true",
                json={"filter": {"must": [{"key": "source_id", "match": {"value": source_id}}]}},
            )
        except httpx.HTTPError:
            logger.warning("Could not delete Qdrant source", extra={"source_id": source_id})
        try:
            await http.post(
                f"{settings.meilisearch_url.rstrip('/')}/indexes/"
                f"{settings.meilisearch_knowledge_index}/documents/delete",
                headers=_meili_headers(settings),
                json={"filter": f'source_id = "{source_id}"'},
            )
        except httpx.HTTPError:
            logger.warning("Could not delete Meilisearch source", extra={"source_id": source_id})


async def search_knowledge(
    workspace_id: str, query: str, limit: int, settings: Settings
) -> list[KnowledgeSearchHit]:
    rankings: dict[str, dict[str, Any]] = {}
    async with httpx.AsyncClient(timeout=30) as http:
        try:
            vector = (await _embed([query], settings))[0]
            response = await http.post(
                f"{settings.qdrant_url.rstrip('/')}/collections/"
                f"{settings.qdrant_collection}/points/search",
                json={
                    "vector": vector,
                    "filter": {
                        "must": [{"key": "workspace_id", "match": {"value": workspace_id}}]
                    },
                    "limit": limit * 3,
                    "with_payload": False,
                },
            )
            response.raise_for_status()
            for rank, point in enumerate(response.json().get("result", []), start=1):
                entry = rankings.setdefault(str(point["id"]), {"score": 0.0, "matched_by": []})
                entry["score"] += 1 / (60 + rank)
                entry["matched_by"].append("semantic")
        except (httpx.HTTPError, KeyError, ValueError, IndexError):
            logger.warning("Semantic knowledge search unavailable", exc_info=True)
        try:
            response = await http.post(
                f"{settings.meilisearch_url.rstrip('/')}/indexes/"
                f"{settings.meilisearch_knowledge_index}/search",
                headers=_meili_headers(settings),
                json={
                    "q": query,
                    "filter": f'workspace_id = "{workspace_id}"',
                    "limit": limit * 3,
                    "attributesToRetrieve": ["id"],
                },
            )
            response.raise_for_status()
            for rank, hit in enumerate(response.json().get("hits", []), start=1):
                entry = rankings.setdefault(str(hit["id"]), {"score": 0.0, "matched_by": []})
                entry["score"] += 1 / (60 + rank)
                entry["matched_by"].append("keyword")
        except (httpx.HTTPError, KeyError, ValueError):
            logger.warning("Keyword knowledge search unavailable", exc_info=True)

    async with SessionFactory() as session:
        if not rankings:
            fallback = list(
                await session.scalars(
                    select(KnowledgeChunk)
                    .where(
                        KnowledgeChunk.workspace_id == workspace_id,
                        KnowledgeChunk.content.contains(query[:100]),
                    )
                    .limit(limit)
                )
            )
            rankings = {
                chunk.id: {"score": 1 / (60 + rank), "matched_by": ["fallback"]}
                for rank, chunk in enumerate(fallback, start=1)
            }
        ids = sorted(rankings, key=lambda item: rankings[item]["score"], reverse=True)[:limit]
        if not ids:
            return []
        rows = await session.execute(
            select(KnowledgeChunk, KnowledgeSource)
            .join(KnowledgeSource, KnowledgeSource.id == KnowledgeChunk.source_id)
            .where(KnowledgeChunk.id.in_(ids), KnowledgeSource.status == "ready")
        )
        by_id = {chunk.id: (chunk, source) for chunk, source in rows}
        return [
            KnowledgeSearchHit(
                chunk_id=chunk.id,
                source_id=source.id,
                source_title=source.title,
                page_number=chunk.page_number,
                content=chunk.content,
                score=rankings[chunk_id]["score"],
                matched_by=rankings[chunk_id]["matched_by"],
                download_url=(
                    f"/api/v1/workspaces/{workspace_id}/knowledge/sources/{source.id}/download"
                ),
            )
            for chunk_id in ids
            if (row := by_id.get(chunk_id)) is not None
            for chunk, source in [row]
        ]
