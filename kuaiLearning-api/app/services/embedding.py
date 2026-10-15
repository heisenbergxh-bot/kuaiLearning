"""Local or OpenAI-compatible embeddings, independent of chat model settings."""

import asyncio
import hashlib
import json
import math
from functools import lru_cache
from typing import TYPE_CHECKING, Any

import httpx

from app.core.config import Settings

if TYPE_CHECKING:
    from fastembed import TextEmbedding


class EmbeddingError(RuntimeError):
    """Safe error message without upstream bodies, document text or credentials."""


@lru_cache(maxsize=2)
def _local_model(model: str, cache_dir: str) -> "TextEmbedding":
    # HTTP deployments never import ONNX/FastEmbed or load a local model.
    try:
        from fastembed import TextEmbedding
    except ImportError:
        raise EmbeddingError(
            "Local embeddings require the local-embedding installation extra"
        ) from None

    return TextEmbedding(model_name=model, cache_dir=cache_dir, threads=1, lazy_load=True)


@lru_cache(maxsize=16)
def _limiter(concurrency: int) -> asyncio.Semaphore:
    return asyncio.Semaphore(concurrency)


def collection_name(settings: Settings) -> str:
    # Preserve the existing collection for the original local model only.
    if (
        settings.embedding_provider == "local"
        and settings.embedding_model
        == "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
        and settings.embedding_dimensions == 384
    ):
        return settings.qdrant_collection
    identity = json.dumps(
        [
            settings.embedding_provider,
            settings.embedding_base_url.rstrip("/")
            if settings.embedding_provider == "openai"
            else "",
            settings.embedding_model,
            settings.embedding_dimensions,
        ]
    )
    fingerprint = hashlib.sha256(identity.encode()).hexdigest()[:16]
    return f"{settings.qdrant_collection}_{fingerprint}"


def _validate_vectors(vectors: Any, count: int, dimensions: int) -> list[list[float]]:
    if not isinstance(vectors, list) or len(vectors) != count:
        raise EmbeddingError("Embedding response count does not match input")
    result: list[list[float]] = []
    for vector in vectors:
        if not isinstance(vector, list) or len(vector) != dimensions:
            raise EmbeddingError("Embedding dimensions do not match EMBEDDING_DIMENSIONS")
        if any(
            isinstance(value, bool)
            or not isinstance(value, (int, float))
            or not math.isfinite(value)
            for value in vector
        ):
            raise EmbeddingError("Embedding response contains invalid numbers")
        result.append([float(value) for value in vector])
    return result


async def _remote_batch(
    client: httpx.AsyncClient, texts: list[str], settings: Settings
) -> list[list[float]]:
    headers = {"Content-Type": "application/json"}
    key = settings.embedding_api_key.get_secret_value()
    if key:
        headers["Authorization"] = f"Bearer {key}"
    for attempt in range(settings.embedding_max_retries + 1):
        try:
            response = await client.post(
                f"{settings.embedding_base_url.rstrip('/')}/embeddings",
                headers=headers,
                json={
                    "model": settings.embedding_model,
                    "input": texts,
                    "encoding_format": "float",
                },
            )
        except httpx.TransportError:
            if attempt == settings.embedding_max_retries:
                raise EmbeddingError("Embedding service connection failed or timed out") from None
        else:
            if response.status_code == 429 or response.status_code >= 500:
                if attempt == settings.embedding_max_retries:
                    raise EmbeddingError(
                        f"Embedding service unavailable (HTTP {response.status_code})"
                    )
            elif response.is_error:
                raise EmbeddingError(f"Embedding request rejected (HTTP {response.status_code})")
            else:
                try:
                    data = response.json()["data"]
                    if not isinstance(data, list) or len(data) != len(texts):
                        raise ValueError
                    by_index = {}
                    for item in data:
                        index = item["index"]
                        if type(index) is not int or index in by_index:
                            raise ValueError
                        by_index[index] = item["embedding"]
                    if set(by_index) != set(range(len(texts))):
                        raise ValueError
                    vectors = [by_index[index] for index in range(len(texts))]
                except (KeyError, TypeError, ValueError):
                    raise EmbeddingError(
                        "Embedding service returned a malformed response"
                    ) from None
                return _validate_vectors(vectors, len(texts), settings.embedding_dimensions)
        await asyncio.sleep(2**attempt)
    raise EmbeddingError("Embedding service unavailable")


async def embed(texts: list[str], settings: Settings) -> list[list[float]]:
    if not texts:
        return []
    if any(not text.strip() for text in texts):
        raise EmbeddingError("Embedding input must not be empty")
    async with _limiter(settings.embedding_max_concurrency):
        if settings.embedding_provider == "local":

            def run() -> list[list[float]]:
                return [
                    vector.tolist()
                    for vector in _local_model(
                        settings.embedding_model, settings.embedding_cache_dir
                    ).embed(texts)
                ]

            vectors = await asyncio.to_thread(run)
            return _validate_vectors(vectors, len(texts), settings.embedding_dimensions)
        result = []
        async with httpx.AsyncClient(timeout=settings.embedding_timeout_seconds) as client:
            for start in range(0, len(texts), settings.embedding_batch_size):
                result.extend(
                    await _remote_batch(
                        client, texts[start : start + settings.embedding_batch_size], settings
                    )
                )
        return result
