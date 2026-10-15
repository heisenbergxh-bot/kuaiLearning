from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db_session
from app.main import create_app
from app.models import KnowledgeSource, LearningWorkspace
from app.models.entities import EmbeddingConfiguration
from app.services.embedding import collection_name
from app.services.embedding_configuration import effective_embedding_settings


@asynccontextmanager
async def configured_app():  # type: ignore[no-untyped-def]
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    settings = Settings(
        _env_file=None,
        app_env="test",
        ai_config_admin_subjects=["admin"],
        ai_config_encryption_key=Fernet.generate_key().decode(),
        embedding_provider="openai",
        embedding_model="original-model",
        embedding_dimensions=1024,
        embedding_base_url="https://embedding.example/v1",
        embedding_api_key="environment-secret",
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    async def database() -> AsyncIterator:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db_session] = database
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        yield client, sessions, settings
    await engine.dispose()


PAYLOAD = {
    "provider": "openai",
    "base_url": "https://embedding.example/v1",
    "model": "original-model",
    "dimensions": 1024,
}


@pytest.mark.asyncio
async def test_embedding_permissions_encryption_and_live_settings() -> None:
    async with configured_app() as (client, sessions, settings):
        initial = await client.get("/api/v1/settings/embedding")
        assert initial.status_code == 200
        assert initial.json()["source"] == "environment"
        assert initial.json()["can_edit"] is False
        assert "environment-secret" not in initial.text
        assert "api_key" not in initial.json()
        assert initial.headers["Cache-Control"] == "no-store"
        assert (await client.put("/api/v1/settings/embedding", json=PAYLOAD)).status_code == 403
        assert (
            await client.post("/api/v1/settings/embedding/test", json=PAYLOAD)
        ).status_code == 403
        client.headers["X-Debug-User"] = "admin"
        saved = await client.put("/api/v1/settings/embedding", json=PAYLOAD)
        assert saved.status_code == 200
        assert saved.json()["source"] == "database"
        assert saved.json()["api_key_configured"] is True
        async with sessions() as session:
            row = await session.get(EmbeddingConfiguration, 1)
            assert row is not None and "environment-secret" not in row.encrypted_api_key
            effective = await effective_embedding_settings(session, settings)
            assert effective.embedding_api_key.get_secret_value() == "environment-secret"
            original_collection = collection_name(effective)
        update = PAYLOAD | {"base_url": "http://internal/v1", "model": "internal-model"}
        assert (await client.put("/api/v1/settings/embedding", json=update)).status_code == 422
        changed = await client.put(
            "/api/v1/settings/embedding", json=update | {"clear_api_key": True}
        )
        assert changed.status_code == 200
        assert changed.json()["api_key_configured"] is False
        async with sessions() as session:
            effective = await effective_embedding_settings(session, settings)
            assert effective.embedding_model == "internal-model"
            assert effective.embedding_api_key.get_secret_value() == ""
            assert collection_name(effective) != original_collection
            assert effective.model_name == settings.model_name


@pytest.mark.asyncio
async def test_existing_sources_block_identity_changes_but_allow_key_rotation() -> None:
    async with configured_app() as (client, sessions, _settings):
        client.headers["X-Debug-User"] = "admin"
        assert (await client.put("/api/v1/settings/embedding", json=PAYLOAD)).status_code == 200
        async with sessions() as session:
            session.add(
                LearningWorkspace(
                    id="workspace", owner_subject="admin", title="Test", learning_goal="Test"
                )
            )
            await session.flush()
            session.add(
                KnowledgeSource(
                    id="source",
                    workspace_id="workspace",
                    owner_subject="admin",
                    title="Source",
                    original_filename="source.txt",
                    storage_path="/unused",
                    byte_size=0,
                    sha256="0" * 64,
                    status="ready",
                )
            )
            await session.commit()
        for change in [{"model": "different"}, {"dimensions": 384}, {"provider": "local"}]:
            assert (
                await client.put("/api/v1/settings/embedding", json=PAYLOAD | change)
            ).status_code == 409
        assert (
            await client.put("/api/v1/settings/embedding", json=PAYLOAD | {"api_key": "rotated"})
        ).status_code == 200
        async with sessions() as session:
            source = await session.get(KnowledgeSource, "source")
            source.status = "processing"
            await session.commit()
        assert (await client.put("/api/v1/settings/embedding", json=PAYLOAD)).status_code == 409


@pytest.mark.asyncio
async def test_connection_probe_does_not_save_or_return_secrets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def probe(texts: list[str], settings: Settings) -> list[list[float]]:
        assert texts == ["Embedding connection test"]
        assert settings.embedding_api_key.get_secret_value() == "probe-secret"
        return [[0.1] * settings.embedding_dimensions]

    monkeypatch.setattr("app.api.routes.embedding_settings.embed", probe)
    async with configured_app() as (client, sessions, _settings):
        client.headers["X-Debug-User"] = "admin"
        result = await client.post(
            "/api/v1/settings/embedding/test", json=PAYLOAD | {"api_key": "probe-secret"}
        )
        assert result.status_code == 200
        assert result.json() == {"ok": True, "dimensions": 1024}
        async with sessions() as session:
            assert await session.get(EmbeddingConfiguration, 1) is None
        for change in [
            {"api_key": ["probe-secret"]},
            {"api_key": " "},
            {"dimensions": 0},
            {"base_url": "file:///private"},
        ]:
            invalid = await client.put("/api/v1/settings/embedding", json=PAYLOAD | change)
            assert invalid.status_code == 422
            assert "probe-secret" not in invalid.text


@pytest.mark.asyncio
async def test_embedding_settings_require_login_and_same_origin() -> None:
    settings = Settings(
        _env_file=None,
        app_env="test",
        auth_mode="external",
        public_base_url="http://test",
        casdoor_issuer="http://identity",
        casdoor_client_id="client",
        casdoor_client_secret="secret",
        casdoor_redirect_uri="http://test/callback",
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        assert (await client.get("/api/v1/settings/embedding")).status_code == 401
        assert (await client.put("/api/v1/settings/embedding", json=PAYLOAD)).status_code == 403
        assert (
            await client.post(
                "/api/v1/settings/embedding/test", headers={"Origin": "http://test"}, json=PAYLOAD
            )
        ).status_code == 401
