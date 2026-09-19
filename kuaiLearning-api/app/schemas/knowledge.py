from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeSourceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    title: str
    source_type: str
    original_filename: str
    mime_type: str | None
    byte_size: int
    status: str
    chunk_count: int
    error_message: str | None
    created_at: datetime
    updated_at: datetime


class KnowledgeSearchHit(BaseModel):
    chunk_id: str
    source_id: str
    source_title: str
    page_number: int | None
    content: str
    score: float
    matched_by: list[Literal["semantic", "keyword", "fallback"]] = Field(default_factory=list)
    download_url: str
