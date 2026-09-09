from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.learning_content import _require_workspace
from app.core.current_user import CurrentUserDependency
from app.db.session import get_db_session
from app.services.model_gateway import (
    ModelGatewayError,
    OpenAICompatibleModelGateway,
    get_model_gateway,
)

router = APIRouter(tags=["AI generation"])


class Message(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["system", "user", "assistant"]
    content: str = Field(min_length=1, max_length=200_000)


class CompletionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[Message] = Field(min_length=1, max_length=20)
    stream: bool = False
    temperature: float = Field(default=0.7, ge=0, le=2)
    max_tokens: int = Field(default=4096, ge=1, le=20_000)

    @model_validator(mode="after")
    def bound_context(self) -> "CompletionRequest":
        if sum(len(message.content) for message in self.messages) > 300_000:
            raise ValueError("Conversation is too long")
        return self


@router.post("/workspaces/{workspace_id}/ai/completions", response_model=None)
async def complete(
    workspace_id: str, payload: CompletionRequest, user: CurrentUserDependency,
    session: Annotated[AsyncSession, Depends(get_db_session)],
    gateway: Annotated[OpenAICompatibleModelGateway, Depends(get_model_gateway)],
) -> StreamingResponse | dict[str, object]:
    await _require_workspace(workspace_id, user, session)
    messages = [message.model_dump() for message in payload.messages]
    if payload.stream:
        return StreamingResponse(
            gateway.stream_messages(
                messages=messages, temperature=payload.temperature, max_tokens=payload.max_tokens,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
        )
    try:
        content = await gateway.complete_messages(
            messages=messages, temperature=payload.temperature, max_tokens=payload.max_tokens,
        )
    except ModelGatewayError as error:
        code = {"configuration": 503, "timeout": 504}.get(error.kind, 502)
        raise HTTPException(code, str(error)) from error
    return {"choices": [{"message": {"role": "assistant", "content": content}}]}
