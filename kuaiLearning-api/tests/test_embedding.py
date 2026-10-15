import json
import subprocess
import sys
from collections.abc import Callable

import httpx
import pytest
from pydantic import SecretStr

from app.core.config import Settings
from app.services.embedding import EmbeddingError, collection_name, embed
from app.services.knowledge import _ensure_indexes

REAL_CLIENT = httpx.AsyncClient


def remote_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "embedding_provider": "openai",
        "embedding_base_url": "https://api.siliconflow.cn/v1",
        "embedding_model": "BAAI/bge-m3",
        "embedding_dimensions": 32,
        "embedding_api_key": SecretStr("test-key"),
        "embedding_max_retries": 0,
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[arg-type]


def mock_service(
    monkeypatch: pytest.MonkeyPatch,
    handler: Callable[[httpx.Request], httpx.Response],
) -> None:
    monkeypatch.setattr(
        "app.services.embedding.httpx.AsyncClient",
        lambda **kwargs: REAL_CLIENT(transport=httpx.MockTransport(handler), **kwargs),
    )


@pytest.mark.asyncio
async def test_remote_batches_reorders_vectors_and_uses_independent_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    requests = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        assert str(request.url) == "https://api.siliconflow.cn/v1/embeddings"
        assert request.headers["Authorization"] == "Bearer test-key"
        body = json.loads(request.content)
        assert body["model"] == "BAAI/bge-m3"
        assert body["encoding_format"] == "float"
        assert "dimensions" not in body
        return httpx.Response(
            200,
            json={
                "data": [
                    {"index": i, "embedding": [float(text)] * 32}
                    for i, text in reversed(list(enumerate(body["input"])))
                ]
            },
        )

    mock_service(monkeypatch, handler)
    vectors = await embed(
        ["1", "2", "3"],
        remote_settings(embedding_batch_size=2, model_api_key=SecretStr("chat-key")),
    )
    assert [vector[0] for vector in vectors] == [1, 2, 3]
    assert len(requests) == 2


@pytest.mark.asyncio
async def test_internal_endpoint_can_omit_authentication(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "http://embedding.internal/v1/embeddings"
        assert "authorization" not in request.headers
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1] * 32}]})

    mock_service(monkeypatch, handler)
    assert (
        len(
            await embed(
                ["内网资料"],
                remote_settings(
                    embedding_base_url="http://embedding.internal/v1/",
                    embedding_api_key=SecretStr(""),
                ),
            )
        )
        == 1
    )


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 503])
async def test_transient_errors_retry(monkeypatch: pytest.MonkeyPatch, status: int) -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            return httpx.Response(status, json={"message": "not logged"})
        return httpx.Response(200, json={"data": [{"index": 0, "embedding": [0.1] * 32}]})

    async def no_sleep(delay: float) -> None:
        pass

    mock_service(monkeypatch, handler)
    monkeypatch.setattr("app.services.embedding.asyncio.sleep", no_sleep)
    await embed(["重试"], remote_settings(embedding_max_retries=1))
    assert attempts == 2


@pytest.mark.asyncio
async def test_auth_failure_is_not_retried_or_exposed(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        return httpx.Response(401, json={"message": "test-key private document"})

    mock_service(monkeypatch, handler)
    with pytest.raises(EmbeddingError, match="HTTP 401") as error:
        await embed(["private document"], remote_settings(embedding_max_retries=2))
    assert "test-key" not in str(error.value)
    assert "private document" not in str(error.value)
    assert attempts == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "data",
    [
        [],
        [{"index": 1, "embedding": [0.1] * 32}],
        [{"index": 0, "embedding": [0.1] * 31}],
        [{"index": 0, "embedding": [True] * 32}],
        [{"index": 0, "embedding": ["0.1"] * 32}],
    ],
)
async def test_invalid_responses_are_rejected(
    monkeypatch: pytest.MonkeyPatch, data: object
) -> None:
    mock_service(monkeypatch, lambda request: httpx.Response(200, json={"data": data}))
    with pytest.raises(EmbeddingError):
        await embed(["资料"], remote_settings())


@pytest.mark.asyncio
async def test_transport_failure_has_bounded_retries(monkeypatch: pytest.MonkeyPatch) -> None:
    attempts = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal attempts
        attempts += 1
        raise httpx.ConnectError("private upstream details", request=request)

    mock_service(monkeypatch, handler)
    with pytest.raises(EmbeddingError, match="connection failed"):
        await embed(["资料"], remote_settings())
    assert attempts == 1


def test_collections_isolate_models_even_with_same_dimensions() -> None:
    current = remote_settings()
    assert collection_name(current) != collection_name(remote_settings(embedding_model="other"))
    assert collection_name(current) != collection_name(remote_settings(embedding_dimensions=64))
    assert collection_name(current) != collection_name(
        remote_settings(embedding_base_url="http://internal/v1")
    )
    assert collection_name(current) == collection_name(
        remote_settings(embedding_api_key=SecretStr("rotated"))
    )
    assert collection_name(Settings(_env_file=None)) == "kuailearning_knowledge"


def test_http_module_does_not_import_local_model_runtime() -> None:
    subprocess.run(
        [
            sys.executable,
            "-c",
            "import app.services.embedding; import sys; "
            "assert 'fastembed' not in sys.modules; assert 'onnxruntime' not in sys.modules",
        ],
        check=True,
    )


@pytest.mark.asyncio
async def test_existing_collection_dimension_mismatch_fails_before_indexing() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.method == "GET"
        return httpx.Response(
            200, json={"result": {"config": {"params": {"vectors": {"size": 384}}}}}
        )

    async with REAL_CLIENT(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(EmbeddingError, match="Qdrant collection dimensions"):
            await _ensure_indexes(remote_settings(), client)


@pytest.mark.parametrize(
    "url", ["ftp://internal/v1", "https://user:password@internal/v1", "https://internal/v1?key=x"]
)
def test_unsafe_base_url_configuration_is_rejected(url: str) -> None:
    with pytest.raises(ValueError, match="EMBEDDING_BASE_URL"):
        remote_settings(embedding_base_url=url)
