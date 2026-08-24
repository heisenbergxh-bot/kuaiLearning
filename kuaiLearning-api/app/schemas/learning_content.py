from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class PrimarySourcePayload(BaseModel):
    title: str = Field(max_length=500)
    url: str = Field(max_length=2000)


class LessonContentPayload(BaseModel):
    schema_version: Literal[1] = 1
    slug: str = Field(default="", max_length=300)
    html_content: str = Field(default="", max_length=5_000_000)
    primary_source: PrimarySourcePayload | None = None
    completed_at_ms: int | None = Field(default=None, ge=0)
    quiz_correct: int | None = Field(default=None, ge=0)
    quiz_total: int | None = Field(default=None, ge=0)
    last_viewed_at_ms: int | None = Field(default=None, ge=0)


class LessonWrite(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    summary: str | None = Field(default=None, max_length=5000)
    source_type: str = Field(default="generated", max_length=32)
    source_ref: str | None = Field(default=None, max_length=500)
    order_index: int = Field(ge=1)
    status: str = Field(default="generated", max_length=32)
    content_payload: LessonContentPayload = Field(default_factory=LessonContentPayload)
    client_updated_at_ms: int | None = Field(default=None, ge=0)


class LessonResponse(LessonWrite):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_at: datetime
    updated_at: datetime


SyllabusStatus = Annotated[Literal["planned", "generated"], Field()]


class SyllabusItemWrite(BaseModel):
    order_index: int = Field(ge=1)
    module_title: str = Field(min_length=1, max_length=200)
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    status: SyllabusStatus = "planned"
    lesson_id: str | None = Field(default=None, max_length=36)
    client_updated_at_ms: int | None = Field(default=None, ge=0)


class SyllabusItemResponse(SyllabusItemWrite):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    created_at: datetime
    updated_at: datetime


class SyllabusGenerateRequest(BaseModel):
    mode: Literal["full", "replan"] = "full"
    guidance: str | None = Field(default=None, max_length=2000)
    language: Literal["zh", "en"] = "zh"
