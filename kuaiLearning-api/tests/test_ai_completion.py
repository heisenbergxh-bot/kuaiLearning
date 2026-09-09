from collections.abc import AsyncIterator
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_db_session
from app.main import create_app
from app.models import LearningWorkspace
from app.services.model_gateway import get_model_gateway


class Gateway:
    calls = 0

    async def complete_messages(self, **kwargs: Any) -> str:
        self.calls += 1
        assert kwargs["messages"][-1]["content"] == "Question"
        return "Answer"

    async def stream_messages(self, **kwargs: Any) -> AsyncIterator[str]:
        self.calls += 1
        yield 'data: {"choices":[{"delta":{"content":"Lesson"}}]}\n\n'
        yield 'data: [DONE]\n\n'


@pytest.mark.asyncio
async def test_only_workspace_owner_can_generate_with_shared_model() -> None:
    engine = create_async_engine("sqlite+aiosqlite://")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as session:
        session.add(LearningWorkspace(
            id="workspace", owner_subject="alice", title="Test", learning_goal="Learn",
        ))
        await session.commit()
    settings = Settings(app_env="test")
    app = create_app(settings)
    app.dependency_overrides[get_settings] = lambda: settings
    gateway = Gateway()
    app.dependency_overrides[get_model_gateway] = lambda: gateway

    async def database() -> AsyncIterator:
        async with sessions() as session:
            yield session

    app.dependency_overrides[get_db_session] = database
    payload = {"messages": [{"role": "user", "content": "Question"}]}
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://test",
    ) as client:
        path = "/api/v1/workspaces/workspace/ai/completions"
        assert (await client.post(path, json=payload)).status_code == 404
        assert gateway.calls == 0
        client.headers["X-Debug-User"] = "alice"
        answer = await client.post(path, json=payload)
        assert answer.json()["choices"][0]["message"]["content"] == "Answer"
        lesson = await client.post(path, json=payload | {"stream": True})
        assert lesson.status_code == 200
        assert lesson.headers["x-accel-buffering"] == "no"
        assert '"content":"Lesson"' in lesson.text
        assert "[DONE]" in lesson.text
        for changes in [{"model": "override"}, {"max_tokens": 20001}, {"api_key": "override"}]:
            assert (await client.post(path, json=payload | changes)).status_code == 422
        assert gateway.calls == 2
    await engine.dispose()
