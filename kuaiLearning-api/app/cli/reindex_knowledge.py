"""Rebuild a model-specific index using existing chunk IDs; leave MySQL untouched."""

import argparse
import asyncio

from sqlalchemy import select

from app.core.config import Settings
from app.db.session import SessionFactory, engine
from app.models import KnowledgeChunk, KnowledgeSource
from app.services.embedding import collection_name, embed
from app.services.embedding_configuration import effective_embedding_settings
from app.services.knowledge import _index_chunks


async def reindex(settings: Settings, apply: bool) -> None:
    print(f"Embedding provider: {settings.embedding_provider}; model: {settings.embedding_model}")
    print(f"Target collection: {collection_name(settings)}")
    async with SessionFactory() as session:
        sources = list(
            await session.scalars(
                select(KnowledgeSource)
                .where(KnowledgeSource.status == "ready")
                .order_by(KnowledgeSource.id)
            )
        )
        print(
            f"Ready sources: {len(sources)}; expected chunks: {sum(s.chunk_count for s in sources)}"
        )
        if not apply:
            print("Preview only. Use --apply to call the embedding service and write indexes.")
            return
        # Validate connectivity and dimensions before writing any points.
        await embed(["知识库向量服务连通性检查"], settings)
        indexed = 0
        for source in sources:
            last_index = -1
            source_count = 0
            while True:
                chunks = list(
                    await session.scalars(
                        select(KnowledgeChunk)
                        .where(
                            KnowledgeChunk.source_id == source.id,
                            KnowledgeChunk.chunk_index > last_index,
                        )
                        .order_by(KnowledgeChunk.chunk_index)
                        .limit(settings.embedding_batch_size)
                    )
                )
                if not chunks:
                    break
                await _index_chunks(source, chunks, settings)
                source_count += len(chunks)
                last_index = chunks[-1].chunk_index
            if source_count != source.chunk_count:
                raise RuntimeError("Source chunk count changed; pause uploads and rerun reindex")
            indexed += source_count
            print(f"Indexed source {source.id}: {source_count} chunks")
        print(f"Completed: {indexed} chunks. MySQL records and old collections were preserved.")


async def _run(apply: bool) -> None:
    try:
        async with SessionFactory() as session:
            settings = await effective_embedding_settings(session, Settings())
        await reindex(settings, apply)
    finally:
        await engine.dispose()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply", action="store_true", help="Write indexes; otherwise preview only"
    )
    args = parser.parse_args()
    asyncio.run(_run(args.apply))


if __name__ == "__main__":
    main()
