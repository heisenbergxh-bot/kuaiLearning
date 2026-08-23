from collections.abc import Iterable
from typing import Any

import pytest
from fastapi import HTTPException

from app.api.routes.learning_content import (
    delete_lesson,
    upsert_lesson,
    upsert_syllabus_item,
)
from app.core.current_user import CurrentUser
from app.models import Lesson, SyllabusItem
from app.schemas import LessonWrite, SyllabusItemWrite


class FakeSession:
    def __init__(self, scalar_results: Iterable[Any]) -> None:
        self.scalar_results = iter(scalar_results)
        self.added: list[Any] = []
        self.deleted: list[Any] = []
        self.commit_count = 0

    async def scalar(self, _statement: Any) -> Any:
        return next(self.scalar_results)

    def add(self, entity: Any) -> None:
        self.added.append(entity)

    async def delete(self, entity: Any) -> None:
        self.deleted.append(entity)

    async def commit(self) -> None:
        self.commit_count += 1

    async def refresh(self, _entity: Any) -> None:
        return None


def lesson_payload() -> LessonWrite:
    return LessonWrite.model_validate(
        {
            "title": "事务边界",
            "order_index": 1,
            "status": "generated",
            "content_payload": {
                "schema_version": 1,
                "slug": "transaction-boundary",
                "html_content": "<h1>事务边界</h1>",
                "quiz_correct": 1,
                "quiz_total": 2,
            },
            "client_updated_at_ms": 2000,
        }
    )


@pytest.mark.asyncio
async def test_upsert_lesson_keeps_browser_id_and_content() -> None:
    session = FakeSession(["workspace-1", None])

    lesson = await upsert_lesson(
        "workspace-1",
        "lesson-1",
        lesson_payload(),
        CurrentUser(subject="identity-1"),
        session,  # type: ignore[arg-type]
    )

    assert lesson.id == "lesson-1"
    assert lesson.workspace_id == "workspace-1"
    assert lesson.content_payload["html_content"] == "<h1>事务边界</h1>"
    assert lesson.client_updated_at_ms == 2000
    assert session.added == [lesson]
    assert session.commit_count == 1


@pytest.mark.asyncio
async def test_syllabus_link_must_reference_lesson_in_same_workspace() -> None:
    session = FakeSession(["workspace-1", None, None])
    payload = SyllabusItemWrite(
        order_index=1,
        module_title="基础",
        title="事务",
        status="generated",
        lesson_id="lesson-from-another-workspace",
    )

    with pytest.raises(HTTPException) as error:
        await upsert_syllabus_item(
            "workspace-1",
            "item-1",
            payload,
            CurrentUser(subject="identity-1"),
            session,  # type: ignore[arg-type]
        )

    assert error.value.status_code == 422
    assert session.commit_count == 0


@pytest.mark.asyncio
async def test_upsert_syllabus_item_after_lesson_exists() -> None:
    session = FakeSession(["workspace-1", None, "lesson-1"])
    payload = SyllabusItemWrite(
        order_index=1,
        module_title="基础",
        title="事务",
        status="generated",
        lesson_id="lesson-1",
        client_updated_at_ms=3000,
    )

    item = await upsert_syllabus_item(
        "workspace-1",
        "item-1",
        payload,
        CurrentUser(subject="identity-1"),
        session,  # type: ignore[arg-type]
    )

    assert isinstance(item, SyllabusItem)
    assert item.lesson_id == "lesson-1"
    assert item.client_updated_at_ms == 3000


@pytest.mark.asyncio
async def test_delete_lesson_is_idempotent() -> None:
    missing_session = FakeSession(["workspace-1", None])
    response = await delete_lesson(
        "workspace-1",
        "missing",
        CurrentUser(subject="identity-1"),
        missing_session,  # type: ignore[arg-type]
    )

    assert response.status_code == 204
    assert missing_session.commit_count == 0

    lesson = Lesson(id="lesson-1", workspace_id="workspace-1")
    existing_session = FakeSession(["workspace-1", lesson])
    await delete_lesson(
        "workspace-1",
        "lesson-1",
        CurrentUser(subject="identity-1"),
        existing_session,  # type: ignore[arg-type]
    )
    assert existing_session.deleted == [lesson]
    assert existing_session.commit_count == 1


@pytest.mark.asyncio
async def test_missing_owned_workspace_blocks_content_access() -> None:
    session = FakeSession([None])

    with pytest.raises(HTTPException) as error:
        await upsert_lesson(
            "missing",
            "lesson-1",
            lesson_payload(),
            CurrentUser(subject="identity-1"),
            session,  # type: ignore[arg-type]
        )

    assert error.value.status_code == 404
