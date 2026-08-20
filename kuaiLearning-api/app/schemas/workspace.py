from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    learning_goal: str = Field(min_length=1, max_length=5000)
    context_snapshot: dict[str, Any] | None = None


class WorkspaceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    title: str
    learning_goal: str
    status: str
    context_snapshot: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
