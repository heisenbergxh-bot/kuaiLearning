from typing import Annotated, Any, Protocol

import httpx
from fastapi import Depends

from app.core.config import Settings, get_settings


class ModelGatewayError(RuntimeError):
    """Safe, user-facing model failure without credentials or response bodies."""

    def __init__(self, message: str, *, kind: str = "upstream") -> None:
        super().__init__(message)
        self.kind = kind


class ModelGateway(Protocol):
    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> str: ...


class OpenAICompatibleModelGateway:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def complete(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
    ) -> str:
        api_key = self._settings.model_api_key.get_secret_value()
        if not api_key:
            raise ModelGatewayError("AI service is not configured", kind="configuration")

        endpoint = f"{self._settings.model_base_url.rstrip('/')}/chat/completions"
        request_body: dict[str, Any] = {
            "model": self._settings.model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        try:
            async with httpx.AsyncClient(timeout=self._settings.model_timeout_seconds) as client:
                response = await client.post(
                    endpoint,
                    headers={"Authorization": f"Bearer {api_key}"},
                    json=request_body,
                )
                response.raise_for_status()
        except httpx.TimeoutException as error:
            raise ModelGatewayError("AI service timed out", kind="timeout") from error
        except httpx.HTTPStatusError as error:
            raise ModelGatewayError(
                f"AI service returned HTTP {error.response.status_code}"
            ) from error
        except httpx.HTTPError as error:
            raise ModelGatewayError("AI service is unavailable") from error

        try:
            payload = response.json()
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise ModelGatewayError("AI service returned an invalid response") from error
        if not isinstance(content, str) or not content.strip():
            raise ModelGatewayError("AI service returned an empty response")
        return content


def get_model_gateway(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ModelGateway:
    return OpenAICompatibleModelGateway(settings)


ModelGatewayDependency = Annotated[ModelGateway, Depends(get_model_gateway)]
