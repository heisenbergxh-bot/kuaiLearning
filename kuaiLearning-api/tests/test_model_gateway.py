import json
from typing import Any

import httpx
import pytest

from app.core.config import Settings
from app.services.model_gateway import ModelGatewayError, OpenAICompatibleModelGateway


def mock_response(monkeypatch: pytest.MonkeyPatch, payload: dict[str, Any]) -> list[dict[str, Any]]:
    requests: list[dict[str, Any]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, json=payload)

    client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: client(transport=httpx.MockTransport(respond), **kwargs),
    )
    return requests


async def complete(settings: Settings) -> str:
    return await OpenAICompatibleModelGateway(settings).complete(
        system_prompt="Design a roadmap", user_prompt="Python basics",
        temperature=0.5, max_tokens=3000,
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(("url", "model", "disable_thinking"), [
    ("https://api.deepseek.com/v1", "deepseek-v4-flash", True),
    ("https://api.deepseek.com", "deepseek-v4-pro", True),
    ("https://other.example/v1", "deepseek-v4-flash", False),
    ("https://api.deepseek.com/v1", "deepseek-reasoner", False),
])
async def test_deepseek_v4_uses_final_answer_budget(
    monkeypatch: pytest.MonkeyPatch, url: str, model: str, disable_thinking: bool,
) -> None:
    requests = mock_response(monkeypatch, {
        "choices": [{"message": {"content": "Basics :: Variables :: Define variables"},
                     "finish_reason": "stop"}],
    })
    result = await complete(Settings(model_base_url=url, model_name=model, model_api_key="test"))
    assert result == "Basics :: Variables :: Define variables"
    if disable_thinking:
        assert requests[0]["thinking"] == {"type": "disabled"}
    else:
        assert "thinking" not in requests[0]


@pytest.mark.asyncio
@pytest.mark.parametrize("content", ["", "Basics :: Variables :: Incomplete"])
async def test_truncated_response_is_not_accepted(
    monkeypatch: pytest.MonkeyPatch, content: str,
) -> None:
    mock_response(monkeypatch, {
        "choices": [{"message": {"content": content, "reasoning_content": "private reasoning"},
                     "finish_reason": "length"}],
    })
    with pytest.raises(ModelGatewayError, match="output limit") as error:
        await complete(Settings(model_api_key="test"))
    assert "private reasoning" not in str(error.value)


@pytest.mark.asyncio
@pytest.mark.parametrize(("tail", "success"), [
    ('data: [DONE]\n\n', True),
    ('data: {"choices":[{"finish_reason":"length"}]}\n\n', False),
    ('', False),
])
async def test_stream_sanitizes_reasoning_and_rejects_incomplete_output(
    monkeypatch: pytest.MonkeyPatch, tail: str, success: bool,
) -> None:
    body = ('data: {"choices":[{"delta":{"reasoning_content":"private reasoning",'
            '"content":"Lesson"}}]}\n\n' + tail)

    def respond(request: httpx.Request) -> httpx.Response:
        assert json.loads(request.content)["thinking"] == {"type": "disabled"}
        return httpx.Response(200, text=body)

    client = httpx.AsyncClient
    monkeypatch.setattr(httpx, "AsyncClient", lambda **kwargs: client(
        transport=httpx.MockTransport(respond), **kwargs,
    ))
    gateway = OpenAICompatibleModelGateway(Settings(
        model_api_key="test", model_name="deepseek-v4-flash",
    ))
    result = "".join([part async for part in gateway.stream_messages(
        messages=[{"role": "user", "content": "Question"}], temperature=0.7, max_tokens=20000,
    )])
    assert "private reasoning" not in result
    assert "Lesson" in result
    assert ("[DONE]" in result) is success
    assert ('"error"' in result) is not success
