"""Persist references, glossary entries and learning records with deletion tombstones."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261025_0008"
down_revision: str | None = "20261013_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "library_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("learning_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column(
            "source_lesson_id", sa.String(36), sa.ForeignKey("lessons.id", ondelete="SET NULL")
        ),
        sa.Column("content_payload", sa.JSON(), nullable=False),
        sa.Column("client_updated_at_ms", sa.BigInteger(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_library_workspace_kind", "library_items", ["workspace_id", "kind"])
    op.create_index("ix_library_items_source_lesson_id", "library_items", ["source_lesson_id"])


def downgrade() -> None:
    op.drop_table("library_items")
