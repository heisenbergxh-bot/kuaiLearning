from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

LibraryKind = Literal["references", "glossary", "records"]


class LibraryPayload(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    created_at_ms: int = Field(alias="createdAt", ge=0)
    source_lesson_id: str | None = Field(default=None, alias="sourceLessonId", max_length=36)


class ReferencePayload(LibraryPayload):
    title: str = Field(min_length=1, max_length=1000)
    html_content: str = Field(alias="htmlContent", max_length=5_000_000)
    source_lesson_number: int | None = Field(default=None, alias="sourceLessonNumber", ge=1)


class GlossaryPayload(LibraryPayload):
    term: str = Field(min_length=1, max_length=1000)
    definition: str = Field(min_length=1, max_length=100_000)
    avoid: list[str] = Field(default_factory=list, max_length=1000)
    category: str | None = Field(default=None, max_length=1000)
    source_lesson_number: int | None = Field(default=None, alias="sourceLessonNumber", ge=1)


class RecordPayload(LibraryPayload):
    number: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=1000)
    content: str = Field(min_length=1, max_length=1_000_000)
    status: str = Field(default="active", max_length=1000)
    evidence: str | None = Field(default=None, max_length=1_000_000)
    implications: str | None = Field(default=None, max_length=1_000_000)


class LibraryWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    content_payload: dict[str, Any]
    client_updated_at_ms: int = Field(ge=0)


class LibraryResponse(LibraryWrite):
    model_config = ConfigDict(from_attributes=True)
    id: str
    workspace_id: str
    kind: LibraryKind
    is_deleted: bool
    created_at: datetime
    updated_at: datetime


class LibraryPage(BaseModel):
    items: list[LibraryResponse]
    next_cursor: str | None = None
