"""Add browser workspace synchronization payload.

Revision ID: 20260823_0003
Revises: 20260821_0002
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260823_0003"
down_revision: str | None = "20260821_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "learning_workspaces",
        sa.Column("content_payload", sa.JSON(), nullable=True),
    )
    op.add_column(
        "learning_workspaces",
        sa.Column("client_updated_at_ms", sa.BigInteger(), nullable=True),
    )
    op.execute("UPDATE learning_workspaces SET content_payload = JSON_OBJECT()")
    op.alter_column(
        "learning_workspaces",
        "content_payload",
        existing_type=sa.JSON(),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("learning_workspaces", "client_updated_at_ms")
    op.drop_column("learning_workspaces", "content_payload")
