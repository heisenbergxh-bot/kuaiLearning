"""Add syllabus and lesson synchronization fields.

Revision ID: 20260823_0004
Revises: 20260823_0003
Create Date: 2026-08-23
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260823_0004"
down_revision: str | None = "20260823_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "lessons",
        sa.Column("client_updated_at_ms", sa.BigInteger(), nullable=True),
    )
    op.create_table(
        "syllabus_items",
        sa.Column("workspace_id", sa.String(length=36), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False),
        sa.Column("module_title", sa.String(length=200), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False),
        sa.Column("lesson_id", sa.String(length=36), nullable=True),
        sa.Column("client_updated_at_ms", sa.BigInteger(), nullable=True),
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["workspace_id"],
            ["learning_workspaces.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lesson_id", name="uq_syllabus_lesson"),
        sa.UniqueConstraint("workspace_id", "order_index", name="uq_syllabus_workspace_order"),
    )
    op.create_index("ix_syllabus_items_lesson_id", "syllabus_items", ["lesson_id"])
    op.create_index("ix_syllabus_items_workspace_id", "syllabus_items", ["workspace_id"])


def downgrade() -> None:
    op.drop_index("ix_syllabus_items_workspace_id", table_name="syllabus_items")
    op.drop_index("ix_syllabus_items_lesson_id", table_name="syllabus_items")
    op.drop_table("syllabus_items")
    op.drop_column("lessons", "client_updated_at_ms")
