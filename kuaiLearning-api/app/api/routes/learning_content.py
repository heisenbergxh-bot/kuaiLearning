from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.current_user import CurrentUser, CurrentUserDependency
from app.db.session import get_db_session
from app.models import LearningWorkspace, Lesson, SyllabusItem
from app.schemas import (
    LessonResponse,
    LessonWrite,
    SyllabusItemResponse,
    SyllabusItemWrite,
)

router = APIRouter(prefix="/workspaces/{workspace_id}", tags=["learning-content"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]


async def _require_workspace(
    workspace_id: str,
    user: CurrentUser,
    session: AsyncSession,
) -> None:
    owned_id = await session.scalar(
        select(LearningWorkspace.id).where(
            LearningWorkspace.id == workspace_id,
            LearningWorkspace.owner_subject == user.subject,
            LearningWorkspace.status != "deleted",
        )
    )
    if owned_id is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Workspace not found")


@router.get("/lessons", response_model=list[LessonResponse])
async def list_lessons(
    workspace_id: str,
    user: CurrentUserDependency,
    session: DbSession,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Lesson]:
    await _require_workspace(workspace_id, user, session)
    result = await session.scalars(
        select(Lesson)
        .where(Lesson.workspace_id == workspace_id)
        .order_by(Lesson.order_index.asc())
        .offset(offset)
        .limit(limit)
    )
    return list(result)


@router.put("/lessons/{lesson_id}", response_model=LessonResponse)
async def upsert_lesson(
    workspace_id: str,
    lesson_id: str,
    payload: LessonWrite,
    user: CurrentUserDependency,
    session: DbSession,
) -> Lesson:
    await _require_workspace(workspace_id, user, session)
    lesson = await session.scalar(select(Lesson).where(Lesson.id == lesson_id))
    if lesson is not None and lesson.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found")
    if lesson is None:
        lesson = Lesson(id=lesson_id, workspace_id=workspace_id)
        session.add(lesson)
    lesson.title = payload.title
    lesson.summary = payload.summary
    lesson.source_type = payload.source_type
    lesson.source_ref = payload.source_ref
    lesson.order_index = payload.order_index
    lesson.status = payload.status
    lesson.content_payload = payload.content_payload.model_dump()
    lesson.client_updated_at_ms = payload.client_updated_at_ms
    await session.commit()
    await session.refresh(lesson)
    return lesson


@router.delete("/lessons/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_lesson(
    workspace_id: str,
    lesson_id: str,
    user: CurrentUserDependency,
    session: DbSession,
) -> Response:
    await _require_workspace(workspace_id, user, session)
    lesson = await session.scalar(
        select(Lesson).where(Lesson.id == lesson_id, Lesson.workspace_id == workspace_id)
    )
    if lesson is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    await session.delete(lesson)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/syllabus", response_model=list[SyllabusItemResponse])
async def list_syllabus_items(
    workspace_id: str,
    user: CurrentUserDependency,
    session: DbSession,
) -> list[SyllabusItem]:
    await _require_workspace(workspace_id, user, session)
    result = await session.scalars(
        select(SyllabusItem)
        .where(SyllabusItem.workspace_id == workspace_id)
        .order_by(SyllabusItem.order_index.asc())
    )
    return list(result)


@router.put("/syllabus/{item_id}", response_model=SyllabusItemResponse)
async def upsert_syllabus_item(
    workspace_id: str,
    item_id: str,
    payload: SyllabusItemWrite,
    user: CurrentUserDependency,
    session: DbSession,
) -> SyllabusItem:
    await _require_workspace(workspace_id, user, session)
    item = await session.scalar(select(SyllabusItem).where(SyllabusItem.id == item_id))
    if item is not None and item.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Syllabus item not found")
    if payload.lesson_id is not None:
        lesson_id = await session.scalar(
            select(Lesson.id).where(
                Lesson.id == payload.lesson_id,
                Lesson.workspace_id == workspace_id,
            )
        )
        if lesson_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="Invalid lesson",
            )
    if item is None:
        item = SyllabusItem(id=item_id, workspace_id=workspace_id)
        session.add(item)
    item.order_index = payload.order_index
    item.module_title = payload.module_title
    item.title = payload.title
    item.description = payload.description
    item.status = payload.status
    item.lesson_id = payload.lesson_id
    item.client_updated_at_ms = payload.client_updated_at_ms
    await session.commit()
    await session.refresh(item)
    return item


@router.delete("/syllabus/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_syllabus_item(
    workspace_id: str,
    item_id: str,
    user: CurrentUserDependency,
    session: DbSession,
) -> Response:
    await _require_workspace(workspace_id, user, session)
    item = await session.scalar(
        select(SyllabusItem).where(
            SyllabusItem.id == item_id,
            SyllabusItem.workspace_id == workspace_id,
        )
    )
    if item is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    await session.delete(item)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
