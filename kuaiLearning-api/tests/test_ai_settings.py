from collections.abc import AsyncIterator

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db_session
from app.main import create_app
from app.models.entities import AIConfiguration
from app.services.model_gateway import get_model_gateway


@pytest.mark.asyncio
async def test_configuration_permissions_persistence_and_runtime_updates() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    settings = Settings(
        app_env="test",
        ai_config_admin_subjects=["admin"],
        ai_config_encryption_key=Fernet.generate_key().decode(),
        model_api_key="environment-key",
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    async def database() -> AsyncIterator:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db_session] = database
    payload = {
        "base_url": "https://model.example/v1/",
        "model": "test-model",
        "api_key": "secret-key",
    }
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        initial = await client.get("/api/v1/settings/ai")
        assert initial.json()["source"] == "environment"
        assert initial.json()["api_key_configured"] is True
        assert "environment-key" not in initial.text
        assert (await client.put("/api/v1/settings/ai", json=payload)).status_code == 403
        client.headers["X-Debug-User"] = "admin"
        saved = await client.put("/api/v1/settings/ai", json=payload)
        assert saved.status_code == 200
        assert saved.json() == {
            "base_url": "https://model.example/v1",
            "model": "test-model",
            "api_key_configured": True,
            "source": "database",
            "can_edit": True,
        }
        assert "secret-key" not in saved.text
        assert saved.headers["cache-control"] == "no-store"
        async with sessions() as session:
            row = await session.get(AIConfiguration, 1)
            assert row is not None
            assert "secret-key" not in row.encrypted_api_key
            gateway = await get_model_gateway(settings, session)
            assert gateway._settings.model_api_key.get_secret_value() == "secret-key"
        updated = await client.put(
            "/api/v1/settings/ai",
            json={
                "base_url": "http://internal-model/v1",
                "model": "updated-model",
            },
        )
        assert updated.status_code == 200
        async with sessions() as session:
            gateway = await get_model_gateway(settings, session)
            assert gateway._settings.model_name == "updated-model"
            assert gateway._settings.model_api_key.get_secret_value() == "secret-key"
        for changes in [
            {"api_key": " "},
            {"model": " "},
            {"base_url": "file:///etc/passwd"},
            {"api_key": ["secret-key"]},
        ]:
            invalid = await client.put("/api/v1/settings/ai", json=payload | changes)
            assert invalid.status_code == 422
            assert "secret-key" not in invalid.text
        settings.ai_config_encryption_key = Settings().ai_config_encryption_key
        assert (await client.put("/api/v1/settings/ai", json=payload)).status_code == 503
    await engine.dispose()


@pytest.mark.asyncio
async def test_configuration_requires_login() -> None:
    settings = Settings(
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
        assert (await client.get("/api/v1/settings/ai")).status_code == 401
        assert (
            await client.put(
                "/api/v1/settings/ai",
                headers={"Origin": "http://test"},
                json={
                    "base_url": "https://model.example/v1",
                    "model": "test",
                    "api_key": "secret",
                },
            )
        ).status_code == 401
