from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class MissionPayload(BaseModel):
    topic: str = Field(default="", max_length=200)
    why: str = Field(default="", max_length=5000)
    success_looks_like: list[Annotated[str, Field(max_length=500)]] = Field(
        default_factory=list,
        max_length=100,
    )
    constraints: str = Field(default="", max_length=5000)
    out_of_scope: str = Field(default="", max_length=5000)


class WorkspaceContentPayload(BaseModel):
    schema_version: Literal[1] = 1
    mission: MissionPayload = Field(default_factory=MissionPayload)
    notes: str = Field(default="", max_length=20000)


class WorkspaceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    learning_goal: str = Field(min_length=1, max_length=5000)
    context_snapshot: dict[str, Any] | None = None
    content_payload: WorkspaceContentPayload = Field(default_factory=WorkspaceContentPayload)
    client_updated_at_ms: int | None = Field(default=None, ge=0)


class WorkspaceUpsert(BaseModel):
    """Browser-owned workspace fields; external context remains server-owned."""

    title: str = Field(min_length=1, max_length=200)
    learning_goal: str = Field(min_length=1, max_length=5000)
    content_payload: WorkspaceContentPayload = Field(default_factory=WorkspaceContentPayload)
    client_updated_at_ms: int | None = Field(default=None, ge=0)


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    learning_goal: str
    status: str
    context_snapshot: dict[str, Any] | None
    content_payload: WorkspaceContentPayload
    client_updated_at_ms: int | None
    created_at: datetime
    updated_at: datetime
