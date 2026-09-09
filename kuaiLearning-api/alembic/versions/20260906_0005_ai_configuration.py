"""Persist the shared AI configuration with an encrypted credential."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260906_0005"
down_revision: str | None = "20260823_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "ai_configuration",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("base_url", sa.String(2048), nullable=False),
        sa.Column("model", sa.String(200), nullable=False),
        sa.Column("encrypted_api_key", sa.Text(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("ai_configuration")
