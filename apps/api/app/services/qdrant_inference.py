"""Qdrant Cloud server-side inference.

When the cluster has an inference model attached to the collection, Qdrant embeds the
text itself: the API sends raw strings and never loads a model. That keeps the
deployment bundle small enough for a serverless function, which cannot carry the
1.1 GB multilingual-e5-base weights.

This module speaks the Qdrant REST API directly with httpx. The Python client's model
classes moved between releases, and the REST shapes below are stable.

Collection shape:

    PUT /collections/{name}
    {"vectors": {"size": 384, "distance": "Cosine"},
     "models": {"text": {"model": "<model>", "options": {"wait": true}}}}

    PUT /collections/{name}/points
    {"points": [{"id": ..., "vector": {"text": "<passage>", "model": "<model>"},
                 "payload": {...}}]}

    POST /collections/{name}/points/query
    {"query": {"text": "<query>", "model": "<model>"}, "limit": 12}
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from app.config import get_settings

log = structlog.get_logger()

# intfloat/multilingual-e5-small has 384 dimensions.
E5_SMALL_DIM = 384


@dataclass(frozen=True)
class InferenceHit:
    """One search result, mirroring the fields the retrieval code needs."""

    key: str
    act_id: str
    section: str
    cosine: float
    payload: dict[str, Any]


class QdrantInferenceError(RuntimeError):
    """The cluster rejected a server-side inference request."""


class QdrantInferenceClient:
    """httpx client for the Qdrant REST endpoints that use server-side inference."""

    def __init__(self, url: str, api_key: str | None, model: str, collection: str) -> None:
        self.base = url.rstrip("/")
        self.model = model
        self.collection = collection
        self._headers = {"api-key": api_key or "", "Content-Type": "application/json"}

    def _check(self, res: httpx.Response, action: str) -> httpx.Response:
        if res.status_code >= 400:
            raise QdrantInferenceError(f"qdrant {action} failed: {res.status_code} {res.text[:300]}")
        return res

    def _create_collection(self) -> None:
        with httpx.Client(timeout=60) as client:
            res = client.delete(f"{self.base}/collections/{self.collection}", headers=self._headers)
            res.raise_for_status() if res.status_code not in (404,) else None
            body = {
                "vectors": {"size": E5_SMALL_DIM, "distance": "Cosine"},
                "models": {"text": {"model": self.model, "options": {"wait": True}}},
            }
            self._check(
                client.put(f"{self.base}/collections/{self.collection}", headers=self._headers, json=body),
                "create_collection",
            )

    def _collection_exists(self) -> bool:
        with httpx.Client(timeout=30) as client:
            res = client.get(f"{self.base}/collections/{self.collection}", headers=self._headers)
            return res.status_code == 200

    def _upsert(self, points: list[dict[str, Any]]) -> None:
        with httpx.Client(timeout=120) as client:
            self._check(
                client.put(
                    f"{self.base}/collections/{self.collection}/points?wait=true",
                    headers=self._headers,
                    json={"points": points},
                ),
                "upsert",
            )

    def _count(self) -> int:
        with httpx.Client(timeout=30) as client:
            res = client.get(
                f"{self.base}/collections/{self.collection}", headers=self._headers
            )
            if res.status_code == 404:
                return 0
            self._check(res, "get_collection")
            data = res.json()
            return int(data.get("result", {}).get("points_count", 0))

    def _search(self, text: str, top_k: int, categories: list[str] | None) -> list[InferenceHit]:
        query: dict[str, Any] = {"text": text, "model": self.model}
        body: dict[str, Any] = {"query": query, "limit": top_k, "with_payload": True}
        if categories:
            body["filter"] = {
                "must": [{"key": "categories", "match": {"any": categories}}]
            }
        with httpx.Client(timeout=60) as client:
            res = client.post(
                f"{self.base}/collections/{self.collection}/points/query",
                headers=self._headers,
                json=body,
            )
        self._check(res, "search")
        points = res.json().get("result", {}).get("points", [])
        hits: list[InferenceHit] = []
        for p in points:
            payload = dict(p.get("payload") or {})
            hits.append(
                InferenceHit(
                    payload.get("key", ""),
                    payload.get("act_id", ""),
                    payload.get("section", ""),
                    float(p.get("score", 0.0)),
                    payload,
                )
            )
        return hits

    # Thin async wrappers. The calls are blocking network IO, so they run in a thread.

    async def ensure_collection(self) -> None:
        await asyncio.to_thread(self._create_collection)

    async def collection_exists(self) -> bool:
        return await asyncio.to_thread(self._collection_exists)

    async def upsert(self, points: list[dict[str, Any]]) -> None:
        await asyncio.to_thread(self._upsert, points)

    async def count(self) -> int:
        return await asyncio.to_thread(self._count)

    async def search(self, text: str, top_k: int, categories: list[str] | None) -> list[InferenceHit]:
        return await asyncio.to_thread(self._search, text, top_k, categories)


def get_inference_client() -> QdrantInferenceClient:
    """Build the client from settings. Only valid when QDRANT_URL points at Qdrant Cloud."""
    s = get_settings()
    if not s.qdrant_url:
        raise QdrantInferenceError("server-side inference needs QDRANT_URL to point at Qdrant Cloud")
    return QdrantInferenceClient(
        url=s.qdrant_url,
        api_key=s.qdrant_api_key,
        model=s.qdrant_inference_model,
        collection=s.qdrant_collection,
    )
