from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, IdMixin, TimestampMixin


class LearningWorkspace(IdMixin, TimestampMixin, Base):
    __tablename__ = "learning_workspaces"
    __table_args__ = (Index("ix_workspace_owner_updated", "owner_subject", "updated_at"),)

    owner_subject: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    external_employee_id: Mapped[str | None] = mapped_column(String(128), index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    learning_goal: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    context_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class AuthIdentity(IdMixin, TimestampMixin, Base):
    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint("issuer", "external_subject", name="uq_auth_identity_issuer_subject"),
    )

    issuer: Mapped[str] = mapped_column(String(255), nullable=False)
    external_subject: Mapped[str] = mapped_column(String(255), nullable=False)
    preferred_username: Mapped[str | None] = mapped_column(String(255))
    display_name: Mapped[str | None] = mapped_column(String(255))
    email: Mapped[str | None] = mapped_column(String(320))
    employee_id: Mapped[str | None] = mapped_column(String(128), index=True)
    last_login_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class AuthLoginState(IdMixin, TimestampMixin, Base):
    __tablename__ = "auth_login_states"

    state_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    code_verifier: Mapped[str] = mapped_column(String(128), nullable=False)
    nonce: Mapped[str] = mapped_column(String(128), nullable=False)
    return_to: Mapped[str] = mapped_column(String(1000), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )


class AuthSession(IdMixin, TimestampMixin, Base):
    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    identity_id: Mapped[str] = mapped_column(
        ForeignKey("auth_identities.id", ondelete="CASCADE"), index=True, nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), index=True, nullable=False
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


class Lesson(IdMixin, TimestampMixin, Base):
    __tablename__ = "lessons"
    __table_args__ = (
        UniqueConstraint("workspace_id", "order_index", name="uq_lesson_workspace_order"),
    )

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("learning_workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    source_type: Mapped[str] = mapped_column(String(32), default="generated", nullable=False)
    source_ref: Mapped[str | None] = mapped_column(String(500))
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)
    content_payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="draft", nullable=False)


class DiagnosticSession(IdMixin, TimestampMixin, Base):
    __tablename__ = "diagnostic_sessions"

    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("learning_workspaces.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_subject: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="in_progress", nullable=False)
    competency_scope: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    conclusion: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class DiagnosticTurn(IdMixin, TimestampMixin, Base):
    __tablename__ = "diagnostic_turns"
    __table_args__ = (
        UniqueConstraint("session_id", "sequence", name="uq_diagnostic_turn_sequence"),
    )

    session_id: Mapped[str] = mapped_column(
        ForeignKey("diagnostic_sessions.id", ondelete="CASCADE"), index=True, nullable=False
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(24), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class PracticeTask(IdMixin, TimestampMixin, Base):
    __tablename__ = "practice_tasks"

    lesson_id: Mapped[str] = mapped_column(
        ForeignKey("lessons.id", ondelete="CASCADE"), index=True, nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    brief: Mapped[str] = mapped_column(Text, nullable=False)
    output_type: Mapped[str] = mapped_column(String(32), default="text", nullable=False)
    evaluation_criteria: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )
    status: Mapped[str] = mapped_column(String(32), default="published", nullable=False)


class PracticeSubmission(IdMixin, TimestampMixin, Base):
    __tablename__ = "practice_submissions"
    __table_args__ = (Index("ix_submission_user_task", "submitter_subject", "task_id"),)

    task_id: Mapped[str] = mapped_column(
        ForeignKey("practice_tasks.id", ondelete="CASCADE"), index=True, nullable=False
    )
    submitter_subject: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    attachments: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="submitted", nullable=False)
    score: Mapped[int | None] = mapped_column(Integer)
    evaluation: Mapped[dict[str, Any] | None] = mapped_column(JSON)


class ExternalLearningContext(IdMixin, TimestampMixin, Base):
    __tablename__ = "external_learning_contexts"
    __table_args__ = (
        UniqueConstraint(
            "owner_subject", "provider", "context_type", name="uq_external_context_owner"
        ),
    )

    owner_subject: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    external_employee_id: Mapped[str | None] = mapped_column(String(128), index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    context_type: Mapped[str] = mapped_column(String(64), nullable=False)
    provider_version: Mapped[str | None] = mapped_column(String(64))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    source_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class LearningEvidenceEvent(IdMixin, TimestampMixin, Base):
    __tablename__ = "learning_evidence_events"
    __table_args__ = (Index("ix_evidence_delivery", "delivery_status", "created_at"),)

    owner_subject: Mapped[str] = mapped_column(String(128), index=True, nullable=False)
    evidence_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_entity_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_entity_id: Mapped[str] = mapped_column(String(36), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    delivery_status: Mapped[str] = mapped_column(String(24), default="pending", nullable=False)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
