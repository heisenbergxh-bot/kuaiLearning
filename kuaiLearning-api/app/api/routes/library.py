from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, Response
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.api.routes.learning_content import DbSession, _require_workspace
from app.core.current_user import CurrentUserDependency
from app.models import Lesson
from app.models.entities import LibraryItem
from app.schemas.library import (
    GlossaryPayload,
    LibraryKind,
    LibraryPage,
    LibraryPayload,
    LibraryResponse,
    LibraryWrite,
    RecordPayload,
    ReferencePayload,
)

router = APIRouter(prefix="/workspaces/{workspace_id}/library", tags=["learning-library"])
EntryId = Annotated[str, Path(min_length=1, max_length=36)]


@router.get("/{kind}", response_model=LibraryPage)
async def list_library(
    workspace_id: str,
    kind: LibraryKind,
    user: CurrentUserDependency,
    session: DbSession,
    response: Response,
    after_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=200, ge=1, le=500),
) -> LibraryPage:
    await _require_workspace(workspace_id, user, session)
    response.headers["Cache-Control"] = "no-store"
    query = select(LibraryItem).where(
        LibraryItem.workspace_id == workspace_id, LibraryItem.kind == kind
    )
    if after_id:
        query = query.where(LibraryItem.id > after_id)
    rows = list(await session.scalars(query.order_by(LibraryItem.id).limit(limit + 1)))
    return LibraryPage(
        items=[LibraryResponse.model_validate(row) for row in rows[:limit]],
        next_cursor=rows[limit - 1].id if len(rows) > limit else None,
    )


@router.put("/{kind}/{entry_id}", response_model=LibraryResponse)
async def upsert_library(
    workspace_id: str,
    kind: LibraryKind,
    entry_id: EntryId,
    payload: LibraryWrite,
    user: CurrentUserDependency,
    session: DbSession,
    response: Response,
) -> LibraryItem:
    await _require_workspace(workspace_id, user, session)
    response.headers["Cache-Control"] = "no-store"
    row = await session.get(LibraryItem, entry_id, with_for_update=True)
    if row is not None and (row.workspace_id != workspace_id or row.kind != kind):
        raise HTTPException(404, "Library item not found")
    # Deleted IDs are terminal; stale browsers must never resurrect them.
    if row is not None and (
        row.is_deleted or payload.client_updated_at_ms <= row.client_updated_at_ms
    ):
        return row
    validators: dict[LibraryKind, type[LibraryPayload]] = {
        "references": ReferencePayload,
        "glossary": GlossaryPayload,
        "records": RecordPayload,
    }
    try:
        content = validators[kind].model_validate(payload.content_payload)
    except ValidationError:
        raise HTTPException(422, "Invalid library item content") from None
    source_id = content.source_lesson_id
    source = await session.get(Lesson, source_id) if source_id else None
    if source is not None and source.workspace_id != workspace_id:
        raise HTTPException(422, "Source lesson must belong to the same workspace")
    if row is None:
        row = LibraryItem(id=entry_id, workspace_id=workspace_id, kind=kind, is_deleted=False)
        session.add(row)
    row.source_lesson_id = source.id if source else None
    row.content_payload = content.model_dump(by_alias=True, exclude_none=True)
    row.client_updated_at_ms = payload.client_updated_at_ms
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            409, "Library item changed concurrently; retry synchronization"
        ) from None
    await session.refresh(row)
    return row


@router.delete("/{kind}/{entry_id}", status_code=204)
async def delete_library(
    workspace_id: str,
    kind: LibraryKind,
    entry_id: EntryId,
    user: CurrentUserDependency,
    session: DbSession,
) -> Response:
    await _require_workspace(workspace_id, user, session)
    row = await session.get(LibraryItem, entry_id, with_for_update=True)
    if row is not None and (row.workspace_id != workspace_id or row.kind != kind):
        raise HTTPException(404, "Library item not found")
    if row is None:
        row = LibraryItem(
            id=entry_id,
            workspace_id=workspace_id,
            kind=kind,
            content_payload={},
            client_updated_at_ms=0,
        )
        session.add(row)
    row.is_deleted = True
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Library item changed concurrently; retry deletion") from None
    return Response(status_code=204)
