from typing import Any

import pytest
from fastapi import HTTPException

from app.api.routes.workspaces import delete_workspace, upsert_workspace
from app.core.current_user import CurrentUser
from app.models import LearningWorkspace
from app.schemas import WorkspaceUpsert


class FakeSession:
    def __init__(self, scalar_result: LearningWorkspace | None = None) -> None:
        self.scalar_result = scalar_result
        self.added: LearningWorkspace | None = None
        self.commit_count = 0

    async def scalar(self, _statement: Any) -> LearningWorkspace | None:
        return self.scalar_result

    def add(self, workspace: LearningWorkspace) -> None:
        self.added = workspace

    async def commit(self) -> None:
        self.commit_count += 1

    async def refresh(self, _workspace: LearningWorkspace) -> None:
        return None


def workspace_payload(topic: str = "Python") -> WorkspaceUpsert:
    return WorkspaceUpsert.model_validate(
        {
            "title": f"学习 {topic}",
            "learning_goal": topic,
            "content_payload": {
                "schema_version": 1,
                "mission": {
                    "topic": topic,
                    "why": "交付项目",
                    "success_looks_like": ["完成可运行程序"],
                    "constraints": "每周三小时",
                    "out_of_scope": "框架源码",
                },
                "notes": "从浏览器同步",
            },
            "client_updated_at_ms": 1234,
        }
    )


@pytest.mark.asyncio
async def test_upsert_creates_workspace_with_client_id() -> None:
    session = FakeSession()

    workspace = await upsert_workspace(
        "client-workspace-1",
        workspace_payload(),
        CurrentUser(subject="identity-1", employee_id="E001"),
        session,  # type: ignore[arg-type]
    )

    assert workspace is session.added
    assert workspace.id == "client-workspace-1"
    assert workspace.owner_subject == "identity-1"
    assert workspace.content_payload["mission"]["topic"] == "Python"
    assert workspace.client_updated_at_ms == 1234
    assert session.commit_count == 1


@pytest.mark.asyncio
async def test_upsert_preserves_server_owned_external_context() -> None:
    existing = LearningWorkspace(
        id="workspace-1",
        owner_subject="identity-1",
        title="Old",
        learning_goal="Old",
        context_snapshot={"job_grade": "B6"},
        content_payload={},
    )
    session = FakeSession(existing)

    updated = await upsert_workspace(
        "workspace-1",
        workspace_payload("SQL"),
        CurrentUser(subject="identity-1"),
        session,  # type: ignore[arg-type]
    )

    assert updated.context_snapshot == {"job_grade": "B6"}
    assert updated.learning_goal == "SQL"
    assert updated.content_payload["mission"]["topic"] == "SQL"


@pytest.mark.asyncio
async def test_upsert_does_not_reveal_workspace_owned_by_another_user() -> None:
    existing = LearningWorkspace(
        id="workspace-1",
        owner_subject="identity-2",
        title="Private",
        learning_goal="Private",
        content_payload={},
    )
    session = FakeSession(existing)

    with pytest.raises(HTTPException) as error:
        await upsert_workspace(
            "workspace-1",
            workspace_payload(),
            CurrentUser(subject="identity-1"),
            session,  # type: ignore[arg-type]
        )

    assert error.value.status_code == 404
    assert session.commit_count == 0


@pytest.mark.asyncio
async def test_delete_requires_an_owned_workspace() -> None:
    session = FakeSession()

    with pytest.raises(HTTPException) as error:
        await delete_workspace(
            "missing",
            CurrentUser(subject="identity-1"),
            session,  # type: ignore[arg-type]
        )

    assert error.value.status_code == 404


@pytest.mark.asyncio
async def test_delete_leaves_a_tombstone_for_other_browsers() -> None:
    existing = LearningWorkspace(
        id="workspace-1",
        owner_subject="identity-1",
        title="Workspace",
        learning_goal="Python",
        content_payload={},
    )
    session = FakeSession(existing)

    response = await delete_workspace(
        "workspace-1",
        CurrentUser(subject="identity-1"),
        session,  # type: ignore[arg-type]
    )

    assert response.status_code == 204
    assert existing.status == "deleted"
    assert session.commit_count == 1
