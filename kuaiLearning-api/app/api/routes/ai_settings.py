from typing import Annotated, Literal
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.current_user import CurrentUserDependency
from app.db.session import get_db_session
from app.models.entities import AIConfiguration
from app.services.ai_configuration import cipher

router = APIRouter(prefix="/settings/ai", tags=["AI settings"])
DbSession = Annotated[AsyncSession, Depends(get_db_session)]
AppSettings = Annotated[Settings, Depends(get_settings)]


class AISettingsWrite(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)

    base_url: str = Field(min_length=1, max_length=2048)
    model: str = Field(min_length=1, max_length=200)
    api_key: SecretStr | None = None

    @field_validator("base_url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        value = value.strip().rstrip("/")
        parsed = urlsplit(value)
        if (
            parsed.scheme not in {"http", "https"}
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError("Use an HTTP(S) base URL without credentials, query or fragment")
        return value

    @field_validator("model")
    @classmethod
    def validate_model(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Model must not be blank")
        return value.strip()


class AISettingsRead(BaseModel):
    base_url: str
    model: str
    api_key_configured: bool
    source: Literal["database", "environment"]
    can_edit: bool


@router.get("", response_model=AISettingsRead)
async def read_ai_settings(
    user: CurrentUserDependency,
    session: DbSession,
    settings: AppSettings,
    response: Response,
) -> AISettingsRead:
    response.headers["Cache-Control"] = "no-store"
    row = await session.get(AIConfiguration, 1)
    return AISettingsRead(
        base_url=row.base_url if row else settings.model_base_url,
        model=row.model if row else settings.model_name,
        api_key_configured=bool(row.encrypted_api_key)
        if row
        else bool(settings.model_api_key.get_secret_value()),
        source="database" if row else "environment",
        can_edit=user.subject in settings.ai_config_admin_subjects,
    )


@router.put("", response_model=AISettingsRead)
async def save_ai_settings(
    payload: AISettingsWrite,
    user: CurrentUserDependency,
    session: DbSession,
    settings: AppSettings,
    response: Response,
) -> AISettingsRead:
    if user.subject not in settings.ai_config_admin_subjects:
        raise HTTPException(403, "AI configuration administrator required")
    row = await session.get(AIConfiguration, 1)
    key = payload.api_key.get_secret_value().strip() if payload.api_key else ""
    if payload.api_key is not None and not key:
        raise HTTPException(422, "API key must not be blank; omit it to keep the saved key")
    if row is None and not key:
        raise HTTPException(422, "API key is required when first saving AI configuration")
    encryption = cipher(settings)
    if row is None:
        row = AIConfiguration(id=1)
        session.add(row)
    row.base_url = payload.base_url
    row.model = payload.model
    if key:
        row.encrypted_api_key = encryption.encrypt(key.encode()).decode()
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(409, "AI configuration changed concurrently; retry saving") from None
    return await read_ai_settings(user, session, settings, response)
