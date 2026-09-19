from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"
    app_host: str = "127.0.0.1"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_log_level: str = "INFO"
    database_url: str = (
        "mysql+asyncmy://kuailearning:change-me@127.0.0.1:3306/kuailearning?charset=utf8mb4"
    )
    database_echo: bool = False
    auth_mode: Literal["development", "external"] = "development"
    public_base_url: str = ""
    casdoor_issuer: str = ""
    casdoor_client_id: str = ""
    casdoor_client_secret: SecretStr = SecretStr("")
    casdoor_redirect_uri: str = ""
    session_cookie_name: str = "kuailearning_session"
    session_ttl_seconds: int = Field(default=28_800, ge=300, le=2_592_000)
    oidc_state_ttl_seconds: int = Field(default=600, ge=60, le=1_800)
    cookie_secure: bool = False
    model_base_url: str = "https://api.deepseek.com/v1"
    model_api_key: SecretStr = SecretStr("")
    model_name: str = "deepseek-chat"
    model_timeout_seconds: int = Field(default=180, ge=5, le=600)
    ai_config_admin_subjects: list[str] = Field(default_factory=list)
    ai_config_encryption_key: SecretStr = SecretStr("")
    knowledge_upload_dir: str = "/opt/kuailearning/uploads"
    knowledge_max_upload_bytes: int = Field(default=209_715_200, ge=1_048_576)
    knowledge_chunk_chars: int = Field(default=700, ge=200, le=2000)
    knowledge_chunk_overlap: int = Field(default=100, ge=0, le=500)
    qdrant_url: str = "http://127.0.0.1:6333"
    qdrant_collection: str = "kuailearning_knowledge"
    embedding_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
    embedding_dimensions: int = Field(default=384, ge=32, le=4096)
    meilisearch_url: str = "http://127.0.0.1:7700"
    meilisearch_api_key: SecretStr = SecretStr("")
    meilisearch_knowledge_index: str = "kuailearning_knowledge"

    @model_validator(mode="after")
    def reject_debug_auth_in_production(self) -> "Settings":
        if self.knowledge_chunk_overlap >= self.knowledge_chunk_chars:
            raise ValueError("KNOWLEDGE_CHUNK_OVERLAP must be smaller than KNOWLEDGE_CHUNK_CHARS")
        if self.app_env == "production" and self.auth_mode == "development":
            raise ValueError("AUTH_MODE=development is forbidden in production")
        if self.app_env == "production" and self.auth_mode == "external":
            required = {
                "CASDOOR_ISSUER": self.casdoor_issuer,
                "CASDOOR_CLIENT_ID": self.casdoor_client_id,
                "CASDOOR_CLIENT_SECRET": self.casdoor_client_secret.get_secret_value(),
                "CASDOOR_REDIRECT_URI": self.casdoor_redirect_uri,
                "PUBLIC_BASE_URL": self.public_base_url,
            }
            missing = [name for name, value in required.items() if not value]
            if missing:
                raise ValueError(
                    f"Missing production authentication settings: {', '.join(missing)}"
                )
        return self

    def casdoor_is_configured(self) -> bool:
        return all(
            (
                self.casdoor_issuer,
                self.casdoor_client_id,
                self.casdoor_client_secret.get_secret_value(),
                self.casdoor_redirect_uri,
                self.public_base_url,
            )
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
