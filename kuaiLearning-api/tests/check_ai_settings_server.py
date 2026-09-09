"""Run with the deployed Python: python tests/check_ai_settings_server.py.

Uses existing runtime dependencies and a temporary SQLite database, never production data.
"""

import asyncio
import importlib.util
import sys
import tempfile
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import httpx  # noqa: E402
from alembic.migration import MigrationContext  # noqa: E402
from alembic.operations import Operations  # noqa: E402
from cryptography.fernet import Fernet  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

from app.core.config import Settings, get_settings  # noqa: E402
from app.db.session import get_db_session  # noqa: E402
from app.main import create_app  # noqa: E402
from app.models.entities import AIConfiguration  # noqa: E402
from app.services.model_gateway import get_model_gateway  # noqa: E402


class Database:
    """Adapt synchronous SQLite for testing this interface without extra async drivers."""

    def __init__(self, session):
        self.session = session

    async def get(self, entity, key):
        return self.session.get(entity, key)

    def add(self, row):
        self.session.add(row)

    async def commit(self):
        self.session.commit()

    async def rollback(self):
        self.session.rollback()


async def check(directory):
    engine = create_engine(f"sqlite:///{directory}/validation.db")
    migration_path = (
        PROJECT_ROOT
        / "alembic/versions/20260906_0005_ai_configuration.py"
    )
    spec = importlib.util.spec_from_file_location("ai_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        migration.upgrade()
    settings = Settings(
        _env_file=None, app_env="test", auth_mode="development",
        ai_config_admin_subjects=["admin"],
        ai_config_encryption_key=Fernet.generate_key().decode(), model_api_key="",
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    async def database():
        with Session(engine, expire_on_commit=False) as session:
            yield Database(session)

    app.dependency_overrides[get_db_session] = database
    payload = {"base_url": "https://model.example/v1", "model": "test", "api_key": "test-secret"}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test"
    ) as client:
        initial = await client.get("/api/v1/settings/ai")
        assert initial.status_code == 200
        assert initial.json()["source"] == "environment"
        assert not initial.json()["api_key_configured"]
        assert (await client.put("/api/v1/settings/ai", json=payload)).status_code == 403
        client.headers["X-Debug-User"] = "admin"
        result = await client.put("/api/v1/settings/ai", json=payload)
        assert result.status_code == 200, result.text
        assert "test-secret" not in result.text
        assert result.json()["source"] == "database"
        del payload["api_key"]
        payload["model"] = "updated"
        assert (await client.put("/api/v1/settings/ai", json=payload)).status_code == 200
        with Session(engine) as session:
            row = session.get(AIConfiguration, 1)
            assert "test-secret" not in row.encrypted_api_key
            gateway = await get_model_gateway(settings, Database(session))
            assert gateway._settings.model_api_key.get_secret_value() == "test-secret"
            assert gateway._settings.model_name == "updated"
        for changes in [{"api_key": " "}, {"api_key": ["test-secret"]},
                        {"base_url": "file:///etc/passwd"}]:
            result = await client.put("/api/v1/settings/ai", json=payload | changes)
            assert result.status_code == 422
            assert "test-secret" not in result.text
    with engine.begin() as connection, Operations.context(MigrationContext.configure(connection)):
        migration.downgrade()
    engine.dispose()
    print("PASS: migration upgrade/downgrade, read/save, administrator permission, encryption,")
    print("secret redaction, omitted-key retention, validation, immediate gateway configuration.")


if __name__ == "__main__":
    with tempfile.TemporaryDirectory(prefix="kuailearning-ai-check-") as directory:
        asyncio.run(check(directory))
