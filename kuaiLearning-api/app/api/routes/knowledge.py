import asyncio
import hashlib
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.learning_content import _require_workspace
from app.core.config import Settings, get_settings
from app.core.current_user import CurrentUserDependency
from app.db.session import get_db_session
from app.models import KnowledgeSource
from app.schemas.knowledge import KnowledgeSearchHit, KnowledgeSourceResponse
from app.services.knowledge import delete_external_chunks, process_source, search_knowledge

router = APIRouter(prefix="/workspaces/{workspace_id}/knowledge", tags=["knowledge"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
SettingsDependency = Annotated[Settings, Depends(get_settings)]

ALLOWED_EXTENSIONS = {".pdf", ".txt", ".md", ".markdown"}
ALLOWED_SOURCE_TYPES = {"core", "supplementary", "exam", "notes", "document"}


async def _source_for_user(
    workspace_id: str,
    source_id: str,
    owner_subject: str,
    session: AsyncSession,
) -> KnowledgeSource:
    source = await session.scalar(
        select(KnowledgeSource).where(
            KnowledgeSource.id == source_id,
            KnowledgeSource.workspace_id == workspace_id,
            KnowledgeSource.owner_subject == owner_subject,
        )
    )
    if source is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="资料不存在")
    return source


@router.get("/sources", response_model=list[KnowledgeSourceResponse])
async def list_sources(
    workspace_id: str,
    user: CurrentUserDependency,
    session: DbSession,
) -> list[KnowledgeSource]:
    await _require_workspace(workspace_id, user, session)
    rows = await session.scalars(
        select(KnowledgeSource)
        .where(
            KnowledgeSource.workspace_id == workspace_id,
            KnowledgeSource.owner_subject == user.subject,
        )
        .order_by(KnowledgeSource.created_at.desc())
    )
    return list(rows)


@router.post(
    "/sources",
    response_model=KnowledgeSourceResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def upload_source(
    workspace_id: str,
    background_tasks: BackgroundTasks,
    user: CurrentUserDependency,
    session: DbSession,
    settings: SettingsDependency,
    file: Annotated[UploadFile, File()],
    title: Annotated[str | None, Form(max_length=300)] = None,
    source_type: Annotated[str, Form(max_length=32)] = "core",
) -> KnowledgeSource:
    await _require_workspace(workspace_id, user, session)
    original_filename = Path(file.filename or "document").name
    extension = Path(original_filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(415, "目前支持 PDF、TXT 和 Markdown 文件")
    if source_type not in ALLOWED_SOURCE_TYPES:
        raise HTTPException(422, "不支持的资料类型")

    source_id = str(uuid4())
    upload_dir = Path(settings.knowledge_upload_dir) / workspace_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    destination = upload_dir / f"{source_id}{extension}"
    digest = hashlib.sha256()
    byte_size = 0
    try:
        with destination.open("wb") as output:
            while chunk := await file.read(1024 * 1024):
                byte_size += len(chunk)
                if byte_size > settings.knowledge_max_upload_bytes:
                    raise HTTPException(413, "文件超过 200MB 上传限制")
                digest.update(chunk)
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    source = KnowledgeSource(
        id=source_id,
        workspace_id=workspace_id,
        owner_subject=user.subject,
        title=(title or Path(original_filename).stem).strip() or "未命名资料",
        source_type=source_type,
        original_filename=original_filename,
        mime_type=file.content_type,
        storage_path=str(destination),
        byte_size=byte_size,
        sha256=digest.hexdigest(),
        status="pending",
        chunk_count=0,
    )
    session.add(source)
    await session.commit()
    await session.refresh(source)
    background_tasks.add_task(process_source, source.id, settings)
    return source


@router.post("/sources/{source_id}/retry", response_model=KnowledgeSourceResponse)
async def retry_source(
    workspace_id: str,
    source_id: str,
    background_tasks: BackgroundTasks,
    user: CurrentUserDependency,
    session: DbSession,
    settings: SettingsDependency,
) -> KnowledgeSource:
    await _require_workspace(workspace_id, user, session)
    source = await _source_for_user(workspace_id, source_id, user.subject, session)
    if source.status in {"pending", "processing"}:
        return source
    source.status = "pending"
    source.error_message = None
    await session.commit()
    await session.refresh(source)
    background_tasks.add_task(process_source, source.id, settings)
    return source


@router.get("/sources/{source_id}/download", response_model=None)
async def download_source(
    workspace_id: str,
    source_id: str,
    user: CurrentUserDependency,
    session: DbSession,
) -> FileResponse:
    await _require_workspace(workspace_id, user, session)
    source = await _source_for_user(workspace_id, source_id, user.subject, session)
    path = Path(source.storage_path)
    if not await asyncio.to_thread(path.is_file):
        raise HTTPException(status_code=404, detail="资料文件不存在")
    return FileResponse(path, media_type=source.mime_type, filename=source.original_filename)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(
    workspace_id: str,
    source_id: str,
    background_tasks: BackgroundTasks,
    user: CurrentUserDependency,
    session: DbSession,
    settings: SettingsDependency,
) -> Response:
    await _require_workspace(workspace_id, user, session)
    source = await _source_for_user(workspace_id, source_id, user.subject, session)
    path = Path(source.storage_path)
    await session.delete(source)
    await session.commit()
    await asyncio.to_thread(path.unlink, missing_ok=True)
    background_tasks.add_task(delete_external_chunks, source_id, settings)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/search", response_model=list[KnowledgeSearchHit])
async def search_sources(
    workspace_id: str,
    user: CurrentUserDependency,
    session: DbSession,
    settings: SettingsDependency,
    q: Annotated[str, Query(min_length=2, max_length=500)],
    limit: Annotated[int, Query(ge=1, le=20)] = 8,
) -> list[KnowledgeSearchHit]:
    await _require_workspace(workspace_id, user, session)
    return await search_knowledge(workspace_id, q.strip(), limit, settings)
