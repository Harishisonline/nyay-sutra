"""Qdrant client wrapper.

Qdrant Cloud when QDRANT_URL is set. Otherwise qdrant-client's embedded local mode, which
persists to QDRANT_PATH and speaks the same API, so local dev never needs a cloud cluster."""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from functools import lru_cache
from typing import Any, TypeVar

import structlog
from qdrant_client import QdrantClient
from qdrant_client.http import models as qm

from app.config import get_settings

T = TypeVar("T")

log = structlog.get_logger()


@dataclass(frozen=True)
class Hit:
    key: str
    act_id: str
    section: str
    cosine: float
    payload: dict[str, Any]


def point_id(key: str) -> str:
    """Qdrant ids must be UUIDs or ints; derive a stable UUID from 'act_id::section'."""
    return str(uuid.uuid5(uuid.NAMESPACE_URL, f"nyay-sutra:{key}"))


class VectorStore:
    def __init__(self) -> None:
        s = get_settings()
        self.collection = s.qdrant_collection
        self._local_path = s.qdrant_path
        self._prefer_cloud = bool(s.qdrant_url)
        self.degraded = False
        if s.qdrant_url:
            self.client = QdrantClient(url=s.qdrant_url, api_key=s.qdrant_api_key, timeout=15)
            self.mode = "cloud"
        else:
            self.client = QdrantClient(path=s.qdrant_path)
            self.mode = "local"

    def _switch_to_local(self) -> None:
        if self.mode == "local":
            return
        log.warning("qdrant_cloud_unavailable")
        self.client = QdrantClient(path=self._local_path)
        self.mode = "local"
        self.degraded = True

    def _with_fallback(self, fn: Callable[[], T]) -> T:
        try:
            return fn()
        except Exception:
            if not self._prefer_cloud or self.degraded:
                raise
            self._switch_to_local()
            return fn()

    def ensure_collection(self, dim: int, *, recreate: bool = False) -> None:
        self._with_fallback(lambda: self._ensure_collection(dim, recreate=recreate))

    def _ensure_collection(self, dim: int, *, recreate: bool = False) -> None:
        exists = self.client.collection_exists(self.collection)
        if exists and recreate:
            self.client.delete_collection(self.collection)
            exists = False
        if exists:
            info = self.client.get_collection(self.collection)
            vectors = info.config.params.vectors
            size = vectors.size if isinstance(vectors, qm.VectorParams) else None
            if size is not None and size != dim:
                self.client.delete_collection(self.collection)
                exists = False
        if not exists:
            self.client.create_collection(
                self.collection, vectors_config=qm.VectorParams(size=dim, distance=qm.Distance.COSINE)
            )

    def upsert(self, items: list[tuple[str, list[float], dict[str, Any]]]) -> None:
        self._with_fallback(lambda: self._upsert(items))

    def _upsert(self, items: list[tuple[str, list[float], dict[str, Any]]]) -> None:
        points = [qm.PointStruct(id=point_id(key), vector=vec, payload={**payload, "key": key})
                  for key, vec, payload in items]
        self.client.upsert(self.collection, points=points, wait=True)

    def _search(self, vector: list[float], top_k: int, categories: list[str] | None) -> list[Hit]:
        return self._with_fallback(lambda: self._search_once(vector, top_k, categories))

    def _search_once(self, vector: list[float], top_k: int, categories: list[str] | None) -> list[Hit]:
        flt = None
        if categories:
            flt = qm.Filter(must=[qm.FieldCondition(key="categories", match=qm.MatchAny(any=categories))])
        res = self.client.query_points(self.collection, query=vector, limit=top_k, query_filter=flt,
                                       with_payload=True)
        hits: list[Hit] = []
        for p in res.points:
            payload = dict(p.payload or {})
            hits.append(Hit(payload.get("key", ""), payload.get("act_id", ""), payload.get("section", ""),
                            float(p.score), payload))
        return hits

    async def search(self, vector: list[float], top_k: int, categories: list[str] | None = None) -> list[Hit]:
        return await asyncio.to_thread(self._search, vector, top_k, categories)

    async def search_text(self, text: str, top_k: int, categories: list[str] | None = None) -> list[Hit]:
        """Search by raw text, letting Qdrant embed it server-side.

        Used when EMBEDDINGS_BACKEND=qdrant, where this process holds no embedding model.
        """
        from app.services.qdrant_inference import get_inference_client

        client = get_inference_client()
        raw = await client.search(f"query: {text}", top_k, categories)
        return [Hit(h.key, h.act_id, h.section, h.cosine, h.payload) for h in raw]

    async def upsert_text(self, items: list[tuple[str, str, dict[str, Any]]]) -> None:
        """Upsert passages as text so Qdrant embeds them server-side."""
        from app.services.qdrant_inference import get_inference_client

        client = get_inference_client()
        points = [
            {
                "id": point_id(key),
                "vector": {"text": text, "model": client.model},
                "payload": {**payload, "key": key},
            }
            for key, text, payload in items
        ]
        await client.upsert(points)

    def _count(self) -> int:
        return self._with_fallback(self._count_once)

    def _count_once(self) -> int:
        if not self.client.collection_exists(self.collection):
            return 0
        return int(self.client.count(self.collection, exact=True).count)

    async def count(self) -> int:
        return await asyncio.to_thread(self._count)


@lru_cache
def get_vector_store() -> VectorStore:
    return VectorStore()
