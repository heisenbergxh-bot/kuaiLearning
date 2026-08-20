from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUserDependency
from app.db.session import get_db_session
from app.models import LearningWorkspace
from app.schemas import WorkspaceCreate, WorkspaceResponse

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
    )
    session.add(workspace)
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
        )
    )
    if workspace is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")
    return workspace
