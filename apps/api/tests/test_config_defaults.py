"""Tests for the configuration defaults that decide which Qdrant collection is read.

The Qdrant server-side embedding path produces 384-dim vectors, the local path
produces 768-dim ones. Pointing the wrong path at the wrong collection fails at
query time with a Qdrant dimension error, so the default has to follow the
embeddings backend.
"""

from __future__ import annotations

from app.config import Settings


def test_qdrant_collection_defaults_to_the_server_side_collection() -> None:
    s = Settings(embeddings_backend="qdrant")
    assert s.qdrant_collection == ""
    assert s.resolved_qdrant_collection == "corpus_chunks_q"


def test_qdrant_collection_defaults_to_the_local_collection() -> None:
    s = Settings(embeddings_backend="local")
    assert s.resolved_qdrant_collection == "corpus_chunks"


def test_explicit_collection_overrides_the_default() -> None:
    s = Settings(embeddings_backend="qdrant", qdrant_collection="my_own_collection")
    assert s.resolved_qdrant_collection == "my_own_collection"


def test_context_window_holds_the_weakest_gold_hit() -> None:
    """The weakest in-domain query puts its gold at rank 9, so the window must be at least 10.

    Measured on the Qdrant server-side path: the gold section lands inside the
    first 10 retrieved chunks for all 35 in-domain questions, and inside the
    first 6 for only 34. A smaller window silently answers a legal question
    without the section that governs it.
    """
    s = Settings()
    assert s.context_chunks >= 10
    assert s.retrieval_top_k >= s.context_chunks
