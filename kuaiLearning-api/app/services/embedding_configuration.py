from cryptography.fernet import InvalidToken
from fastapi import HTTPException
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.models.entities import EmbeddingConfiguration
from app.services.ai_configuration import cipher


async def effective_embedding_settings(session: AsyncSession, settings: Settings) -> Settings:
    row = await session.get(EmbeddingConfiguration, 1)
    if row is None:
        return settings
    key = ""
    if row.encrypted_api_key:
        try:
            key = cipher(settings).decrypt(row.encrypted_api_key.encode()).decode()
        except (InvalidToken, UnicodeDecodeError):
            raise HTTPException(503, "Embedding credential cannot be decrypted") from None
    return Settings.model_validate(
        settings.model_dump()
        | {
            "embedding_provider": row.provider,
            "embedding_base_url": row.base_url,
            "embedding_model": row.model,
            "embedding_dimensions": row.dimensions,
            "embedding_api_key": SecretStr(key),
        }
    )
