"""Add uploaded knowledge sources and searchable chunks."""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "20260919_0006"
down_revision: str | None = "20260906_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "knowledge_sources",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("learning_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_subject", sa.String(128), nullable=False),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("source_type", sa.String(32), nullable=False, server_default="document"),
        sa.Column("original_filename", sa.String(500), nullable=False),
        sa.Column("mime_type", sa.String(200)),
        sa.Column("storage_path", sa.String(1000), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("chunk_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.String(1000)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_knowledge_sources_workspace_id", "knowledge_sources", ["workspace_id"])
    op.create_index("ix_knowledge_sources_owner_subject", "knowledge_sources", ["owner_subject"])
    op.create_index(
        "ix_knowledge_source_workspace_status", "knowledge_sources", ["workspace_id", "status"]
    )
    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "source_id",
            sa.String(36),
            sa.ForeignKey("knowledge_sources.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workspace_id",
            sa.String(36),
            sa.ForeignKey("learning_workspaces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("chunk_index", sa.Integer(), nullable=False),
        sa.Column("page_number", sa.Integer()),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("char_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("source_id", "chunk_index", name="uq_knowledge_chunk_source_index"),
    )
    op.create_index("ix_knowledge_chunks_source_id", "knowledge_chunks", ["source_id"])
    op.create_index("ix_knowledge_chunks_workspace_id", "knowledge_chunks", ["workspace_id"])
    op.create_index(
        "ix_knowledge_chunk_workspace_source", "knowledge_chunks", ["workspace_id", "source_id"]
    )


def downgrade() -> None:
    op.drop_table("knowledge_chunks")
    op.drop_table("knowledge_sources")
