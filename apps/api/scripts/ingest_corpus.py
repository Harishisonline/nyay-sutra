"""Index the statute corpus into Qdrant and mirror it into corpus_acts / corpus_sections.

    python -m scripts.ingest_corpus --mock        # seed corpus (app/data/seed_corpus.json)
    python -m scripts.ingest_corpus --recreate    # drop and rebuild the collection

Embedded Qdrant (no QDRANT_URL) locks its directory, so stop the API before running this.
The API also indexes automatically on startup when the collection is empty.
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from app.db.client import dispose_db, get_sessionmaker, init_db
from app.services import ingest
from app.services.corpus import get_corpus
from app.services.embeddings import get_embedder
from app.services.vector_store import get_vector_store


async def main(recreate: bool) -> int:
    corpus = get_corpus()
    print(f"corpus v{corpus.version}: {len(corpus.acts)} acts, {len(corpus.sections)} sections")
    print(f"embedder: {get_embedder().describe()}")
    total = ingest.index_vectors(corpus, recreate=recreate)
    await init_db()
    async with get_sessionmaker()() as db:
        await ingest.mirror_to_db(db, corpus)
    await dispose_db()
    count = await get_vector_store().count()
    print(f"indexed {total} sections; collection now holds {count} points")
    return 0 if count >= total else 1


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--mock", action="store_true", help="index the bundled seed corpus (the only source in v1)")
    parser.add_argument("--recreate", action="store_true", help="drop the collection first")
    args = parser.parse_args()
    sys.exit(asyncio.run(main(args.recreate)))
