import json
from collections.abc import AsyncIterator
from typing import Annotated, Any, Protocol
from urllib.parse import urlsplit

import httpx
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.db.session import get_db_session
from app.services.ai_configuration import effective_model_settings


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
        return await self.complete_messages(
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=temperature, max_tokens=max_tokens,
        )

    def request_body(
        self, messages: list[dict[str, str]], temperature: float, max_tokens: int,
        *, stream: bool,
    ) -> dict[str, Any]:
        body: dict[str, Any] = {
            "model": self._settings.model_name, "messages": messages,
            "stream": stream, "temperature": temperature, "max_tokens": max_tokens,
        }
        if (
            urlsplit(self._settings.model_base_url).hostname == "api.deepseek.com"
            and self._settings.model_name.startswith("deepseek-v4-")
        ):
            body["thinking"] = {"type": "disabled"}
        return body

    async def complete_messages(
        self, *, messages: list[dict[str, str]], temperature: float, max_tokens: int,
    ) -> str:
        api_key = self._settings.model_api_key.get_secret_value()
        if not api_key:
            raise ModelGatewayError("AI service is not configured", kind="configuration")

        endpoint = f"{self._settings.model_base_url.rstrip('/')}/chat/completions"
        request_body = self.request_body(messages, temperature, max_tokens, stream=False)
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
            choice = payload["choices"][0]
            content = choice["message"]["content"]
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise ModelGatewayError("AI service returned an invalid response") from error
        if choice.get("finish_reason") == "length":
            raise ModelGatewayError(
                "AI response reached the output limit before completion; "
                "use a non-thinking model or increase the output budget"
            )
        if not isinstance(content, str) or not content.strip():
            raise ModelGatewayError("AI service returned an empty response")
        return content

    async def stream_messages(
        self, *, messages: list[dict[str, str]], temperature: float, max_tokens: int,
    ) -> AsyncIterator[str]:
        """Forward only answer text, never provider diagnostics or reasoning."""
        def event(payload: dict[str, Any]) -> str:
            return "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n"

        yield ": connected\n\n"
        api_key = self._settings.model_api_key.get_secret_value()
        try:
            if not api_key:
                raise ModelGatewayError("AI service is not configured")
            body = self.request_body(messages, temperature, max_tokens, stream=True)
            async with httpx.AsyncClient(timeout=self._settings.model_timeout_seconds) as client:
                async with client.stream(
                    "POST", f"{self._settings.model_base_url.rstrip('/')}/chat/completions",
                    headers={"Authorization": f"Bearer {api_key}"}, json=body,
                ) as response:
                    response.raise_for_status()
                    has_content = False
                    async for line in response.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if not data:
                            continue
                        if data == "[DONE]":
                            if not has_content:
                                raise ModelGatewayError("AI service returned an empty response")
                            yield "data: [DONE]\n\n"
                            return
                        payload = json.loads(data)
                        if payload.get("error"):
                            raise ModelGatewayError("AI service failed during generation")
                        for choice in payload.get("choices", []):
                            if choice.get("finish_reason") == "length":
                                raise ModelGatewayError("AI response reached the output limit")
                            if choice.get("finish_reason") == "content_filter":
                                raise ModelGatewayError(
                                    "AI service could not complete this request"
                                )
                            content = choice.get("delta", {}).get("content")
                            if isinstance(content, str) and content:
                                has_content = True
                                yield event({"choices": [{"delta": {"content": content}}]})
                    raise ModelGatewayError("AI response stream ended before completion")
        except ModelGatewayError as error:
            yield event({"error": {"message": str(error)}})
        except httpx.TimeoutException:
            yield event({"error": {"message": "AI service timed out"}})
        except httpx.HTTPError:
            yield event({"error": {"message": "AI service is unavailable"}})
        except (ValueError, TypeError, AttributeError):
            yield event({"error": {"message": "AI service returned an invalid response"}})


async def get_model_gateway(
    settings: Annotated[Settings, Depends(get_settings)],
    session: Annotated[AsyncSession, Depends(get_db_session)],
) -> OpenAICompatibleModelGateway:
    return OpenAICompatibleModelGateway(await effective_model_settings(session, settings))


ModelGatewayDependency = Annotated[ModelGateway, Depends(get_model_gateway)]
