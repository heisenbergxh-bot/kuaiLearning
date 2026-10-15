from typing import Literal

from fastapi import APIRouter, HTTPException, Response
from pydantic import Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.routes.ai_settings import AISettingsWrite, AppSettings, DbSession
from app.core.config import Settings
from app.core.current_user import CurrentUserDependency
from app.models import KnowledgeSource
from app.models.entities import EmbeddingConfiguration
from app.services.ai_configuration import cipher
from app.services.embedding import EmbeddingError, collection_name, embed
from app.services.embedding_configuration import effective_embedding_settings

router = APIRouter(prefix="/settings/embedding", tags=["Embedding settings"])


class EmbeddingSettingsWrite(AISettingsWrite):
    provider: Literal["openai", "local"]
    dimensions: int = Field(ge=32, le=4096, strict=True)
    clear_api_key: bool = False

    @model_validator(mode="after")
    def check_key_action(self) -> "EmbeddingSettingsWrite":
        if self.clear_api_key and self.api_key is not None:
            raise ValueError("Choose a new key or clear the key, not both")
        return self


class EmbeddingSettingsRead(EmbeddingSettingsWrite):
    # Exclude credentials entirely from the response model.
    api_key: None = Field(default=None, exclude=True)
    clear_api_key: bool = Field(default=False, exclude=True)
    api_key_configured: bool
    source: Literal["database", "environment"]
    can_edit: bool
    knowledge_source_count: int


async def candidate_settings(payload: EmbeddingSettingsWrite, current: Settings) -> Settings:
    key = current.embedding_api_key
    if payload.clear_api_key:
        key = type(key)("")
    elif payload.api_key is not None:
        value = payload.api_key.get_secret_value().strip()
        if not value:
            raise HTTPException(422, "Omit the key to keep it, or select no authentication")
        key = type(key)(value)
    elif (
        payload.provider == "openai"
        and key.get_secret_value()
        and payload.base_url != current.embedding_base_url.rstrip("/")
    ):
        raise HTTPException(422, "Changing the endpoint requires a new key or no authentication")
    return Settings.model_validate(
        current.model_dump()
        | {
            "embedding_provider": payload.provider,
            "embedding_base_url": payload.base_url,
            "embedding_model": payload.model,
            "embedding_dimensions": payload.dimensions,
            "embedding_api_key": key,
        }
    )


@router.get("", response_model=EmbeddingSettingsRead)
async def read_embedding_settings(
    user: CurrentUserDependency, session: DbSession, settings: AppSettings, response: Response
) -> EmbeddingSettingsRead:
    response.headers["Cache-Control"] = "no-store"
    effective = await effective_embedding_settings(session, settings)
    row = await session.get(EmbeddingConfiguration, 1)
    count = await session.scalar(select(func.count()).select_from(KnowledgeSource))
    return EmbeddingSettingsRead(
        provider=effective.embedding_provider,
        base_url=effective.embedding_base_url,
        model=effective.embedding_model,
        dimensions=effective.embedding_dimensions,
        api_key_configured=bool(effective.embedding_api_key.get_secret_value()),
        source="database" if row else "environment",
        can_edit=user.subject in settings.ai_config_admin_subjects,
        knowledge_source_count=count or 0,
    )


@router.put("", response_model=EmbeddingSettingsRead)
async def save_embedding_settings(
    payload: EmbeddingSettingsWrite,
    user: CurrentUserDependency,
    session: DbSession,
    settings: AppSettings,
    response: Response,
) -> EmbeddingSettingsRead:
    if user.subject not in settings.ai_config_admin_subjects:
        raise HTTPException(403, "Embedding configuration administrator required")
    # Upload/retry uses the same row lock so a new source cannot use stale settings.
    row = await session.get(EmbeddingConfiguration, 1, with_for_update=True)
    current = await effective_embedding_settings(session, settings)
    candidate = await candidate_settings(payload, current)
    count = await session.scalar(select(func.count()).select_from(KnowledgeSource))
    processing = await session.scalar(
        select(func.count())
        .select_from(KnowledgeSource)
        .where(KnowledgeSource.status.in_(["pending", "processing"]))
    )
    if processing:
        raise HTTPException(409, "Wait for knowledge processing to finish before changing settings")
    if count and collection_name(current) != collection_name(candidate):
        raise HTTPException(
            409, "Existing sources require reindexing or removal before changing models"
        )
    key = candidate.embedding_api_key.get_secret_value()
    encrypted = cipher(settings).encrypt(key.encode()).decode() if key else ""
    if row is None:
        row = EmbeddingConfiguration(id=1)
        session.add(row)
    row.provider = candidate.embedding_provider
    row.base_url = candidate.embedding_base_url.rstrip("/")
    row.model = candidate.embedding_model
    row.dimensions = candidate.embedding_dimensions
    row.encrypted_api_key = encrypted
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "Embedding settings changed concurrently; retry saving") from None
    return await read_embedding_settings(user, session, settings, response)


@router.post("/test")
async def test_embedding_settings(
    payload: EmbeddingSettingsWrite,
    user: CurrentUserDependency,
    session: DbSession,
    settings: AppSettings,
    response: Response,
) -> dict[str, int | bool]:
    response.headers["Cache-Control"] = "no-store"
    if user.subject not in settings.ai_config_admin_subjects:
        raise HTTPException(403, "Embedding configuration administrator required")
    current = await effective_embedding_settings(session, settings)
    candidate = await candidate_settings(payload, current)
    try:
        vectors = await embed(["Embedding connection test"], candidate)
    except EmbeddingError as error:
        raise HTTPException(502, str(error)) from None
    return {"ok": True, "dimensions": len(vectors[0])}
