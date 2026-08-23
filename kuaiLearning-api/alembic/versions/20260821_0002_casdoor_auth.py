"""Add Casdoor identity and local session tables."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260821_0002"
down_revision: str | None = "20260820_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _identity_columns() -> list[sa.Column[object]]:
    return [
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    ]


def upgrade() -> None:
    op.create_table(
        "auth_identities",
        *_identity_columns(),
        sa.Column("issuer", sa.String(255), nullable=False),
        sa.Column("external_subject", sa.String(255), nullable=False),
        sa.Column("preferred_username", sa.String(255)),
        sa.Column("display_name", sa.String(255)),
        sa.Column("email", sa.String(320)),
        sa.Column("employee_id", sa.String(128)),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint(
            "issuer",
            "external_subject",
            name="uq_auth_identity_issuer_subject",
        ),
    )
    op.create_index("ix_auth_identities_employee_id", "auth_identities", ["employee_id"])

    op.create_table(
        "auth_login_states",
        *_identity_columns(),
        sa.Column("state_hash", sa.String(64), nullable=False),
        sa.Column("code_verifier", sa.String(128), nullable=False),
        sa.Column("nonce", sa.String(128), nullable=False),
        sa.Column("return_to", sa.String(1000), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("state_hash"),
    )
    op.create_index("ix_auth_login_states_state_hash", "auth_login_states", ["state_hash"])
    op.create_index("ix_auth_login_states_expires_at", "auth_login_states", ["expires_at"])

    op.create_table(
        "auth_sessions",
        *_identity_columns(),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("identity_id", sa.String(36), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["identity_id"],
            ["auth_identities.id"],
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint("token_hash"),
    )
    op.create_index("ix_auth_sessions_token_hash", "auth_sessions", ["token_hash"])
    op.create_index("ix_auth_sessions_identity_id", "auth_sessions", ["identity_id"])
    op.create_index("ix_auth_sessions_expires_at", "auth_sessions", ["expires_at"])


def downgrade() -> None:
    op.drop_table("auth_sessions")
    op.drop_table("auth_login_states")
    op.drop_table("auth_identities")
