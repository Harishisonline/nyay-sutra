from __future__ import annotations

import structlog
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import CorpusAct, CorpusSection
from app.services.corpus import Corpus, Section, get_corpus
from app.services.embeddings import QdrantInferenceE5, get_embedder
from app.services.vector_store import get_vector_store

log = structlog.get_logger()
BATCH = 16


def _payload(sec: Section) -> dict[str, object]:
    """The payload Qdrant stores next to each vector. Retrieval reads act_id and section from it."""
    return {
        "key": sec.key,
        "act_id": sec.act_id,
        "section": sec.section,
        "categories": list(sec.categories),
        "text": sec.body,
    }


def index_vectors(corpus: Corpus, *, recreate: bool = False) -> int:
    """Embed every section and upsert it into Qdrant. Point ids are deterministic, so reruns are idempotent."""
    embedder = get_embedder()
    store = get_vector_store()
    store.ensure_collection(embedder.dim, recreate=recreate)
    total = 0
    for start in range(0, len(corpus.sections), BATCH):
        batch = corpus.sections[start:start + BATCH]
        vectors = embedder.embed_passages([sec.passage(corpus.act(sec.act_id)) for sec in batch])
        store.upsert([
            (sec.key, vec, _payload(sec))
            for sec, vec in zip(batch, vectors, strict=True)
        ])
        total += len(batch)
    log.info("corpus_indexed", sections=total, embedder=embedder.name)
    return total


async def index_vectors_server_side(corpus: Corpus, *, recreate: bool = False) -> int:
    """Hand the passages to Qdrant as text and let the cluster embed them.

    Used when EMBEDDINGS_BACKEND=qdrant, where this process holds no embedding model.
    """
    from app.services.qdrant_inference import get_inference_client

    client = get_inference_client()
    store = get_vector_store()
    if recreate or not await client.collection_exists():
        await client.ensure_collection()
    total = 0
    for start in range(0, len(corpus.sections), BATCH):
        batch = corpus.sections[start:start + BATCH]
        await store.upsert_text([
            (sec.key, f"passage: {sec.passage(corpus.act(sec.act_id))}", _payload(sec))
            for sec in batch
        ])
        total += len(batch)
    log.info("corpus_indexed", sections=total, embedder="qdrant-inference")
    return total


async def mirror_to_db(db: AsyncSession, corpus: Corpus) -> None:
    """Keep corpus_acts / corpus_sections in step with the seed file so SQL joins and audits work."""
    await db.execute(delete(CorpusSection))
    await db.execute(delete(CorpusAct))
    for act in corpus.acts.values():
        db.add(CorpusAct(id=act.id, short_name=act.short_name, full_name=act.full_name,
                         jurisdiction=act.jurisdiction, state=act.state, enacted_year=act.enacted_year,
                         repealed_year=act.repealed_year, official_url=act.official_url))
    await db.flush()
    for sec in corpus.sections:
        db.add(CorpusSection(act_id=sec.act_id, section=sec.section, title=sec.title, body=sec.body,
                             language="english"))
    await db.commit()


async def ensure_indexed(db: AsyncSession) -> None:
    corpus = get_corpus()
    store = get_vector_store()
    embedder = get_embedder()
    if isinstance(embedder, QdrantInferenceE5):
        from app.services.qdrant_inference import get_inference_client

        client = get_inference_client()
        if await client.count() < len(corpus.sections):
            await index_vectors_server_side(corpus)
            await mirror_to_db(db, corpus)
        return
    store.ensure_collection(embedder.dim)
    if await store.count() < len(corpus.sections):
        index_vectors(corpus)
        await mirror_to_db(db, corpus)
