from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.entities import AIConfiguration


def cipher(settings: Settings) -> Fernet:
    try:
        return Fernet(settings.ai_config_encryption_key.get_secret_value().encode())
    except (ValueError, TypeError):
        raise HTTPException(
            503, "AI configuration encryption key is not configured correctly"
        ) from None


async def effective_model_settings(session: AsyncSession, settings: Settings) -> Settings:
    row = await session.get(AIConfiguration, 1)
    if row is None:
        return settings
    try:
        api_key = cipher(settings).decrypt(row.encrypted_api_key.encode()).decode()
    except InvalidToken:
        raise HTTPException(503, "AI configuration credential cannot be decrypted") from None
    return settings.model_copy(
        update={
            "model_base_url": row.base_url,
            "model_name": row.model,
            "model_api_key": SecretStr(api_key),
        }
    )
