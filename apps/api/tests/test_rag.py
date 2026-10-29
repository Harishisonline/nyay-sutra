from __future__ import annotations

import json

import httpx
import pytest

from app.services import llm, rag
from app.services.corpus import get_corpus
from tests.conftest import FakeProvider, grounded_json, sign_in

CTX = rag.ChatContext(state="Maharashtra", city="Pune", age=34, language="english")


def _chunks(scores: list[float]) -> list[rag.Chunk]:
    corpus = get_corpus()
    sections = corpus.sections_in("tenancy") + corpus.sections_in("consumer")
    return [rag.Chunk(i + 1, sec, corpus.act(sec.act_id), 0.9, score)
            for i, (sec, score) in enumerate(zip(sections, scores, strict=False))]


@pytest.fixture
def fixed_retrieval(monkeypatch: pytest.MonkeyPatch) -> list[rag.Chunk]:
    chunks = _chunks([0.92, 0.85, 0.7, 0.6])

    async def fake_retrieve(question: str, ctx: rag.ChatContext) -> tuple[list[rag.Chunk], str]:
        return chunks, "none"

    monkeypatch.setattr(rag, "retrieve", fake_retrieve)
    return chunks


@pytest.fixture(autouse=True)
def _providers() -> None:
    llm.set_providers_for_tests(None)


async def test_grounded_answer_returns_two_valid_citations(app_env: None, fixed_retrieval: list[rag.Chunk]) -> None:
    llm.set_providers_for_tests([FakeProvider("groq", [grounded_json((1, 2))])])
    result = await rag.answer("My landlord cut the water supply", "english", CTX)

    assert result.answered
    assert len(result.citations) >= 2
    corpus = get_corpus()
    for c in result.citations:
        assert corpus.get(c.act_id, c.section) is not None
    assert "[1]" in result.answer and "[2]" in result.answer


async def test_hallucinated_citation_is_dropped_and_routes_to_error(app_env: None,
                                                                    fixed_retrieval: list[rag.Chunk]) -> None:
    llm.set_providers_for_tests([FakeProvider("groq", [grounded_json((1, 9))])])
    result = await rag.answer("My landlord cut the water supply", "english", CTX)

    assert not result.answered
    assert result.kind == "citation_missing"
    assert result.valid_citations == 1


async def test_model_uncertainty_routes_to_error(app_env: None, fixed_retrieval: list[rag.Chunk]) -> None:
    llm.set_providers_for_tests([FakeProvider("groq", [grounded_json(uncertain=True)])])
    result = await rag.answer("Something unrelated", "english", CTX)

    assert not result.answered
    assert result.kind == "model_refused"
    assert result.model_flag


async def test_low_model_confidence_routes_to_error(app_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    chunks = _chunks([0.58, 0.56, 0.5])

    async def fake_retrieve(question: str, ctx: rag.ChatContext) -> tuple[list[rag.Chunk], str]:
        return chunks, "none"

    monkeypatch.setattr(rag, "retrieve", fake_retrieve)
    llm.set_providers_for_tests([FakeProvider("groq", [grounded_json(confidence=0.1)])])
    result = await rag.answer("Vague question", "english", CTX)

    assert not result.answered
    assert result.kind == "low_confidence"
    assert result.confidence < 0.6


async def test_related_match_below_old_threshold_is_cited(app_env: None, monkeypatch: pytest.MonkeyPatch) -> None:
    chunks = _chunks([0.41, 0.40, 0.36])

    async def fake_retrieve(question: str, ctx: rag.ChatContext) -> tuple[list[rag.Chunk], str]:
        return chunks, "none"

    monkeypatch.setattr(rag, "retrieve", fake_retrieve)
    llm.set_providers_for_tests([FakeProvider("groq", [grounded_json((1, 2))])])
    result = await rag.answer("My landlord is kicking me out for no reason", "english", CTX)

    assert result.answered
    assert len(result.citations) >= 2
    assert all(c.source_url for c in result.citations)


async def test_unrelated_question_gets_advice_and_india_code_link(app_env: None,
                                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    chunks = _chunks([0.0, 0.0])

    async def fake_retrieve(question: str, ctx: rag.ChatContext) -> tuple[list[rag.Chunk], str]:
        return chunks, "none"

    monkeypatch.setattr(rag, "retrieve", fake_retrieve)
    advice = json.dumps({
        "answer": (
            "The loaded statutes do not cover getting a vehicle released.\n"
            "- Ask the office that took it for the seizure memo.\n"
            "- Call 15100 if you need a free lawyer."
        ),
        "category": "other",
        "title": "Vehicle release",
        "confidence": 0.4,
    })
    groq = FakeProvider("groq", [advice])
    llm.set_providers_for_tests([groq])
    result = await rag.answer("I want to get my bike out", "english", CTX)

    assert result.answered
    assert result.citations == []
    assert "indiacode.nic.in" in result.answer
    assert "Section" not in result.answer
    assert groq.prompts


async def test_state_acts_dropped_outside_maharashtra(app_env: None) -> None:
    chunks, _ = await rag.retrieve("landlord rent deposit eviction", rag.ChatContext("Karnataka", None, 30, "english"))
    corpus = get_corpus()
    assert chunks
    assert all(corpus.act(c.act.id).jurisdiction == "central" for c in chunks)


async def test_query_endpoint_answers_with_citations(client: httpx.AsyncClient,
                                                     fixed_retrieval: list[rag.Chunk]) -> None:
    llm.set_providers_for_tests([FakeProvider("groq", [grounded_json((1, 2))])])
    headers = await sign_in(client, "+919812345601")
    res = await client.post("/api/v1/query", json={"question": "My landlord cut the water supply"}, headers=headers)

    assert res.status_code == 200, res.text
    data = res.json()
    assert data["status"] == "answered"
    assert len(data["message"]["citations"]) >= 2
    assert all(c["act_id"] and c["section"] for c in data["message"]["citations"])


async def test_obscure_question_returns_diagnostic(client: httpx.AsyncClient,
                                                   monkeypatch: pytest.MonkeyPatch) -> None:
    chunks = _chunks([0.2])

    async def fake_retrieve(question: str, ctx: rag.ChatContext) -> tuple[list[rag.Chunk], str]:
        return chunks, "none"

    monkeypatch.setattr(rag, "retrieve", fake_retrieve)
    headers = await sign_in(client, "+919812345602")
    res = await client.post("/api/v1/query", json={"question": "Rules for owning a pet dragon?"}, headers=headers)

    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "answered"
    assert data["message"]["citations"] == []
    assert "indiacode.nic.in" in data["message"]["content"]
    assert "15100" in data["message"]["content"]
