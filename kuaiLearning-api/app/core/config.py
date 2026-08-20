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
    model_base_url: str = "https://api.deepseek.com/v1"
    model_api_key: SecretStr = SecretStr("")
    model_name: str = "deepseek-chat"
    model_timeout_seconds: int = Field(default=180, ge=5, le=600)

    @model_validator(mode="after")
    def reject_debug_auth_in_production(self) -> "Settings":
        if self.app_env == "production" and self.auth_mode == "development":
            raise ValueError("AUTH_MODE=development is forbidden in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
