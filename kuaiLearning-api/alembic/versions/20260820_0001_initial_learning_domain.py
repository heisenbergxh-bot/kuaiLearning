"""Create the initial learning domain tables."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260820_0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _identity_columns() -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "learning_workspaces",
        *_identity_columns(),
        sa.Column("owner_subject", sa.String(128), nullable=False),
        sa.Column("external_employee_id", sa.String(128)),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("learning_goal", sa.Text(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("context_snapshot", sa.JSON()),
    )
    op.create_index(
        "ix_learning_workspaces_owner_subject", "learning_workspaces", ["owner_subject"]
    )
    op.create_index(
        "ix_workspace_owner_updated", "learning_workspaces", ["owner_subject", "updated_at"]
    )
    op.create_index(
        "ix_learning_workspaces_external_employee_id",
        "learning_workspaces",
        ["external_employee_id"],
    )

    op.create_table(
        "lessons",
        *_identity_columns(),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("learning_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("summary", sa.Text()),
        sa.Column("source_type", sa.String(32), nullable=False),
        sa.Column("source_ref", sa.String(500)),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("content_payload", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.UniqueConstraint("workspace_id", "order_index", name="uq_lesson_workspace_order"),
    )
    op.create_index("ix_lessons_workspace_id", "lessons", ["workspace_id"])

    op.create_table(
        "diagnostic_sessions",
        *_identity_columns(),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("learning_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_subject", sa.String(128), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("competency_scope", sa.JSON(), nullable=False),
        sa.Column("conclusion", sa.JSON()),
    )
    op.create_index("ix_diagnostic_sessions_workspace_id", "diagnostic_sessions", ["workspace_id"])
    op.create_index(
        "ix_diagnostic_sessions_owner_subject", "diagnostic_sessions", ["owner_subject"]
    )

    op.create_table(
        "diagnostic_turns",
        *_identity_columns(),
        sa.Column(
            "session_id",
            sa.String(36),
            sa.ForeignKey("diagnostic_sessions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("role", sa.String(24), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("evidence", sa.JSON()),
        sa.UniqueConstraint("session_id", "sequence", name="uq_diagnostic_turn_sequence"),
    )
    op.create_index("ix_diagnostic_turns_session_id", "diagnostic_turns", ["session_id"])

    op.create_table(
        "practice_tasks",
        *_identity_columns(),
        sa.Column(
            "lesson_id",
            sa.String(36),
            sa.ForeignKey("lessons.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("brief", sa.Text(), nullable=False),
        sa.Column("output_type", sa.String(32), nullable=False),
        sa.Column("evaluation_criteria", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
    )
    op.create_index("ix_practice_tasks_lesson_id", "practice_tasks", ["lesson_id"])

    op.create_table(
        "practice_submissions",
        *_identity_columns(),
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("practice_tasks.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("submitter_subject", sa.String(128), nullable=False),
        sa.Column("content", sa.Text()),
        sa.Column("attachments", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("score", sa.Integer()),
        sa.Column("evaluation", sa.JSON()),
    )
    op.create_index("ix_practice_submissions_task_id", "practice_submissions", ["task_id"])
    op.create_index(
        "ix_practice_submissions_submitter_subject", "practice_submissions", ["submitter_subject"]
    )
    op.create_index(
        "ix_submission_user_task", "practice_submissions", ["submitter_subject", "task_id"]
    )

    op.create_table(
        "external_learning_contexts",
        *_identity_columns(),
        sa.Column("owner_subject", sa.String(128), nullable=False),
        sa.Column("external_employee_id", sa.String(128)),
        sa.Column("provider", sa.String(64), nullable=False),
        sa.Column("context_type", sa.String(64), nullable=False),
        sa.Column("provider_version", sa.String(64)),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("source_updated_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint(
            "owner_subject", "provider", "context_type", name="uq_external_context_owner"
        ),
    )
    op.create_index(
        "ix_external_learning_contexts_owner_subject",
        "external_learning_contexts",
        ["owner_subject"],
    )
    op.create_index(
        "ix_external_learning_contexts_external_employee_id",
        "external_learning_contexts",
        ["external_employee_id"],
    )

    op.create_table(
        "learning_evidence_events",
        *_identity_columns(),
        sa.Column("owner_subject", sa.String(128), nullable=False),
        sa.Column("evidence_type", sa.String(64), nullable=False),
        sa.Column("source_entity_type", sa.String(64), nullable=False),
        sa.Column("source_entity_id", sa.String(36), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("delivery_status", sa.String(24), nullable=False),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
    )
    op.create_index(
        "ix_learning_evidence_events_owner_subject", "learning_evidence_events", ["owner_subject"]
    )
    op.create_index(
        "ix_evidence_delivery", "learning_evidence_events", ["delivery_status", "created_at"]
    )


def downgrade() -> None:
    op.drop_table("learning_evidence_events")
    op.drop_table("external_learning_contexts")
    op.drop_table("practice_submissions")
    op.drop_table("practice_tasks")
    op.drop_table("diagnostic_turns")
    op.drop_table("diagnostic_sessions")
    op.drop_table("lessons")
    op.drop_table("learning_workspaces")
