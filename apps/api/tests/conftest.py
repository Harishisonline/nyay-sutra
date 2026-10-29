from __future__ import annotations

import json
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import pytest

os.environ.update({
    "APP_ENV": "test",
    "AUTH_BACKEND": "local",
    "EMBEDDINGS_BACKEND": "hash",
    "QDRANT_URL": "",
    "GROQ_API_KEY": "",
    "GEMINI_API_KEY": "",
    "ALLOW_OFFLINE_LLM": "true",
})

from app.config import get_settings
from app.core.ratelimit import limiter
from app.db import client as db_client
from app.services import ingest, llm, rag
from app.services.corpus import get_corpus
from app.services.embeddings import get_embedder
from app.services.vector_store import get_vector_store


@dataclass
class FakeProvider:
    """Stands in for Groq / Gemini. `script` is consumed in order; an int raises that HTTP status."""

    name: str
    script: list[str | int] = field(default_factory=list)
    model: str = "fake-model"
    prompts: list[str] = field(default_factory=list)

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str:
        self.prompts.append(user)
        step = self.script.pop(0) if self.script else self.default()
        if isinstance(step, int):
            raise llm.ProviderError(self.name, step, "scripted failure")
        return step

    def default(self) -> str:
        return grounded_json()


def grounded_json(citations: tuple[int, ...] = (1, 2), confidence: float = 0.9, uncertain: bool = False) -> str:
    markers = " ".join(f"[{n}]" for n in citations)
    return json.dumps({
        "answer": f"Your landlord must follow the law before cutting essential supplies {markers}.\n- Keep receipts.",
        "citations": list(citations),
        "category": "tenancy",
        "confidence": confidence,
        "uncertain": uncertain,
        "uncertainty_reason": "Sources do not cover this." if uncertain else None,
        "title": "Landlord cut water supply",
    })


def _reset_caches() -> None:
    get_settings.cache_clear()
    get_embedder.cache_clear()
    get_vector_store.cache_clear()
    limiter.reset()
    llm.set_providers_for_tests(None)


@pytest.fixture
async def app_env(tmp_path: Path) -> AsyncIterator[None]:
    os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tmp_path / 'test.db'}"
    os.environ["QDRANT_PATH"] = str(tmp_path / "qdrant")
    _reset_caches()
    await db_client.dispose_db()
    await db_client.init_db()
    async with db_client.get_sessionmaker()() as db:
        await ingest.ensure_indexed(db)
    yield
    get_vector_store().client.close()
    await db_client.dispose_db()
    _reset_caches()


@pytest.fixture
def grounded(monkeypatch: pytest.MonkeyPatch) -> FakeProvider:
    """Retrieval returns three tenancy sections and the LLM answers with citations [1] and [2]."""
    corpus = get_corpus()
    sections = corpus.sections_in("tenancy")[:3]

    async def fake_retrieve(question: str, ctx: rag.ChatContext) -> tuple[list[rag.Chunk], str]:
        return [rag.Chunk(i + 1, s, corpus.act(s.act_id), 0.9, 0.9 - i * 0.05) for i, s in enumerate(sections)], "none"

    monkeypatch.setattr(rag, "retrieve", fake_retrieve)
    provider = FakeProvider("groq")
    llm.set_providers_for_tests([provider])
    return provider


@pytest.fixture
async def client(app_env: None) -> AsyncIterator[httpx.AsyncClient]:
    from app.main import create_app

    transport = httpx.ASGITransport(app=create_app())
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def sign_in(client: httpx.AsyncClient, phone: str, **profile: object) -> dict[str, str]:
    res = await client.post("/api/v1/auth/request-otp", json={"phone": phone})
    assert res.status_code == 200, res.text
    code = res.json()["dev_code"]
    res = await client.post("/api/v1/auth/verify-otp", json={"phone": phone, "code": code, "mode": "signup"})
    assert res.status_code == 200, res.text
    headers = {"Authorization": f"Bearer {res.json()['access_token']}"}
    body = {"name": "Test User", "age": 34, "state": "Maharashtra", "district": "Pune", "area": "Kothrud",
            "preferred_language": "english", "onboarding_completed": True, **profile}
    res = await client.patch("/api/v1/users/me", json=body, headers=headers)
    assert res.status_code == 200, res.text
    return headers
