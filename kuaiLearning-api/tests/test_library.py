from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
import pytest
from sqlalchemy import event
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db_session
from app.main import create_app
from app.models import LearningWorkspace, Lesson


@asynccontextmanager
async def library_app():  # type: ignore[no-untyped-def]
    engine = create_async_engine("sqlite+aiosqlite://")

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(connection, _record):  # type: ignore[no-untyped-def]
        connection.execute("PRAGMA foreign_keys=ON")

    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        session.add_all(
            [
                LearningWorkspace(
                    id="workspace", owner_subject="alice", title="A", learning_goal="A"
                ),
                LearningWorkspace(id="other", owner_subject="bob", title="B", learning_goal="B"),
            ]
        )
        await session.flush()
        session.add_all(
            [
                Lesson(id="lesson", workspace_id="workspace", title="L", order_index=1),
                Lesson(id="other-lesson", workspace_id="other", title="L", order_index=1),
            ]
        )
        await session.commit()
    settings = Settings(_env_file=None, app_env="test")
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    async def database() -> AsyncIterator:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db_session] = database
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Debug-User": "alice"},
    ) as client:
        yield client, app
    await engine.dispose()


CONTENTS = {
    "references": {"title": "速查资料", "htmlContent": "<p>完整正文</p>"},
    "glossary": {"term": "事务", "definition": "全部成功或全部失败", "avoid": ["部分提交"]},
    "records": {"number": 1, "title": "记录", "content": "学到了事务", "evidence": "例子"},
}
ROOT = "/api/v1/workspaces/workspace/library"


@pytest.mark.asyncio
async def test_legacy_backfill_restored_by_new_client_and_owner_isolation() -> None:
    async with library_app() as (client, app):
        for kind, content in CONTENTS.items():
            payload = {
                "content_payload": content | {"createdAt": 1000, "sourceLessonId": "lesson"},
                "client_updated_at_ms": 2000,
            }
            saved = await client.put(f"{ROOT}/{kind}/{kind}-id", json=payload)
            assert saved.status_code == 200, saved.text
            assert saved.json()["id"] == f"{kind}-id"
        async with httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Debug-User": "alice"},
        ) as new_device:
            for kind, content in CONTENTS.items():
                restored = await new_device.get(f"{ROOT}/{kind}")
                assert restored.status_code == 200
                assert restored.headers["Cache-Control"] == "no-store"
                row = restored.json()["items"][0]
                for key, value in content.items():
                    assert row["content_payload"][key] == value
                assert row["content_payload"]["sourceLessonId"] == "lesson"
        client.headers["X-Debug-User"] = "bob"
        for method in ["GET", "PUT", "DELETE"]:
            path = f"{ROOT}/references" + ("/references-id" if method != "GET" else "")
            response = await client.request(method, path, json=payload if method == "PUT" else None)
            assert response.status_code == 404


@pytest.mark.asyncio
async def test_deletion_tombstone_and_pagination_prevent_resurrection() -> None:
    async with library_app() as (client, _app):
        payload = {
            "content_payload": CONTENTS["glossary"] | {"createdAt": 1},
            "client_updated_at_ms": 10,
        }
        for entry_id in ["a", "b", "c"]:
            assert (
                await client.put(f"{ROOT}/glossary/{entry_id}", json=payload)
            ).status_code == 200
        # Even an ID that has never reached the server gets a deletion marker.
        for entry_id in ["a", "missing"]:
            assert (await client.delete(f"{ROOT}/glossary/{entry_id}")).status_code == 204
            retried = await client.put(
                f"{ROOT}/glossary/{entry_id}",
                json=payload
                | {
                    "client_updated_at_ms": 999999,
                },
            )
            assert retried.json()["is_deleted"] is True
        first = (await client.get(f"{ROOT}/glossary?limit=2")).json()
        second = (
            await client.get(f"{ROOT}/glossary?limit=2&after_id={first['next_cursor']}")
        ).json()
        assert [row["id"] for row in first["items"] + second["items"]] == ["a", "b", "c", "missing"]
        assert second["next_cursor"] is None
        stale = await client.put(
            f"{ROOT}/glossary/b",
            json=payload
            | {
                "client_updated_at_ms": 9,
                "content_payload": CONTENTS["glossary"] | {"createdAt": 1, "term": "stale"},
            },
        )
        assert stale.json()["content_payload"]["term"] == "事务"


@pytest.mark.asyncio
async def test_source_validation_and_lesson_delete_only_tombstones_derived_items() -> None:
    async with library_app() as (client, _app):
        payload = {
            "content_payload": CONTENTS["references"] | {"createdAt": 1},
            "client_updated_at_ms": 10,
        }
        invalid = await client.put(
            f"{ROOT}/references/bad",
            json=payload
            | {
                "content_payload": payload["content_payload"] | {"sourceLessonId": "other-lesson"},
            },
        )
        assert invalid.status_code == 422
        assert (await client.put(f"{ROOT}/references/manual", json=payload)).status_code == 200
        for kind, content in CONTENTS.items():
            result = await client.put(
                f"{ROOT}/{kind}/derived-{kind}",
                json=payload
                | {
                    "content_payload": content | {"createdAt": 1, "sourceLessonId": "lesson"},
                },
            )
            assert result.status_code == 200
        deleted = await client.delete("/api/v1/workspaces/workspace/lessons/lesson")
        assert deleted.status_code == 204, deleted.text
        for kind in CONTENTS:
            rows = (await client.get(f"{ROOT}/{kind}")).json()["items"]
            derived = next(row for row in rows if row["id"] == f"derived-{kind}")
            assert derived["is_deleted"] is True
            if kind == "references":
                assert next(row for row in rows if row["id"] == "manual")["is_deleted"] is False


@pytest.mark.asyncio
async def test_external_auth_and_cross_origin_writes_are_rejected() -> None:
    settings = Settings(
        _env_file=None,
        app_env="test",
        auth_mode="external",
        public_base_url="http://test",
        casdoor_issuer="http://identity.test",
        casdoor_client_id="test",
        casdoor_client_secret="test",
        casdoor_redirect_uri="http://test/api/v1/auth/callback",
    )
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings

    async def database() -> AsyncIterator:
        yield None  # Authentication must fail before accessing any workspace data.

    app.dependency_overrides[get_db_session] = database
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Debug-User": "alice"},
    ) as client:
        assert (await client.get(f"{ROOT}/references")).status_code == 401
        assert (await client.delete(f"{ROOT}/references/id")).status_code == 403
        assert (
            await client.delete(
                f"{ROOT}/references/id",
                headers={"Origin": "http://test"},
            )
        ).status_code == 401
