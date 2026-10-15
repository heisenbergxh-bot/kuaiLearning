"""Persist independently configurable embedding settings."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20261013_0007"
down_revision: str | None = "20260919_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "embedding_configuration",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("base_url", sa.String(2048), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("dimensions", sa.Integer(), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("embedding_configuration")
