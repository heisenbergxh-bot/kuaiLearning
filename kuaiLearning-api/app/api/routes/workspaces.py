from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUserDependency
from app.db.session import get_db_session
from app.models import LearningWorkspace
from app.schemas import WorkspaceCreate, WorkspaceResponse, WorkspaceUpsert

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]


@router.post("", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED)
async def create_workspace(
    payload: WorkspaceCreate,
    user: CurrentUserDependency,
    session: DbSession,
) -> LearningWorkspace:
    workspace = LearningWorkspace(
        owner_subject=user.subject,
        external_employee_id=user.employee_id,
        title=payload.title,
        learning_goal=payload.learning_goal,
        context_snapshot=payload.context_snapshot,
        content_payload=payload.content_payload.model_dump(),
        client_updated_at_ms=payload.client_updated_at_ms,
    )
    session.add(workspace)
    await session.commit()
    await session.refresh(workspace)
    return workspace


@router.put("/{workspace_id}", response_model=WorkspaceResponse)
async def upsert_workspace(
    workspace_id: str,
    payload: WorkspaceUpsert,
    user: CurrentUserDependency,
    session: DbSession,
) -> LearningWorkspace:
    if not workspace_id or len(workspace_id) > 36:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid ID")

    workspace = await session.scalar(
        select(LearningWorkspace).where(LearningWorkspace.id == workspace_id)
    )
    if workspace is not None and workspace.owner_subject != user.subject:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    if workspace is not None and workspace.status == "deleted":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Workspace was deleted")

    if workspace is None:
        workspace = LearningWorkspace(
            id=workspace_id,
            owner_subject=user.subject,
            external_employee_id=user.employee_id,
            title=payload.title,
            learning_goal=payload.learning_goal,
            content_payload=payload.content_payload.model_dump(),
            client_updated_at_ms=payload.client_updated_at_ms,
        )
        session.add(workspace)
    else:
        workspace.title = payload.title
        workspace.learning_goal = payload.learning_goal
        workspace.content_payload = payload.content_payload.model_dump()
        workspace.client_updated_at_ms = payload.client_updated_at_ms
        workspace.external_employee_id = user.employee_id

    await session.commit()
    await session.refresh(workspace)
    return workspace


@router.get("", response_model=list[WorkspaceResponse])
async def list_workspaces(
    user: CurrentUserDependency,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[LearningWorkspace]:
    result = await session.scalars(
        select(LearningWorkspace)
        .where(LearningWorkspace.owner_subject == user.subject)
        .order_by(LearningWorkspace.updated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result)


@router.get("/{workspace_id}", response_model=WorkspaceResponse)
async def get_workspace(
    workspace_id: str,
    user: CurrentUserDependency,
    session: DbSession,
) -> LearningWorkspace:
    workspace = await session.scalar(
        select(LearningWorkspace).where(
            LearningWorkspace.id == workspace_id,
            LearningWorkspace.owner_subject == user.subject,
            LearningWorkspace.status != "deleted",
        )
    )
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: str,
    user: CurrentUserDependency,
    session: DbSession,
) -> Response:
    workspace = await session.scalar(
        select(LearningWorkspace).where(
            LearningWorkspace.id == workspace_id,
            LearningWorkspace.owner_subject == user.subject,
        )
    )
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    workspace.status = "deleted"
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
