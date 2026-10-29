from __future__ import annotations

import pytest

from app.services import llm
from tests.conftest import FakeProvider, grounded_json


@pytest.fixture(autouse=True)
def _clear() -> None:
    llm.set_providers_for_tests(None)


@pytest.mark.parametrize("status", [429, 500, 503])
async def test_retryable_groq_failure_falls_back_to_gemini(status: int) -> None:
    groq = FakeProvider("groq", [status])
    gemini = FakeProvider("gemini", [grounded_json()])
    llm.set_providers_for_tests([groq, gemini])

    result = await llm.generate("system", "user")

    assert result.provider == "gemini"
    assert result.fallback_used is True
    assert result.json()["category"] == "tenancy"
    assert len(groq.prompts) == 1 and len(gemini.prompts) == 1


async def test_groq_success_does_not_call_gemini() -> None:
    groq = FakeProvider("groq", [grounded_json()])
    gemini = FakeProvider("gemini")
    llm.set_providers_for_tests([groq, gemini])

    result = await llm.generate("system", "user")

    assert result.provider == "groq"
    assert result.fallback_used is False
    assert gemini.prompts == []


async def test_non_retryable_error_does_not_fall_back() -> None:
    groq = FakeProvider("groq", [400])
    gemini = FakeProvider("gemini")
    llm.set_providers_for_tests([groq, gemini])

    with pytest.raises(llm.LLMUnavailable):
        await llm.generate("system", "user")
    assert gemini.prompts == []


async def test_all_providers_down_raises_unavailable() -> None:
    llm.set_providers_for_tests([FakeProvider("groq", [429]), FakeProvider("gemini", [503])])
    with pytest.raises(llm.LLMUnavailable):
        await llm.generate("system", "user")


async def test_no_providers_configured_raises_unavailable() -> None:
    llm.set_providers_for_tests([])
    with pytest.raises(llm.LLMUnavailable):
        await llm.generate("system", "user")


def test_parse_json_object_strips_code_fences() -> None:
    assert llm.parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    with pytest.raises(ValueError):
        llm.parse_json_object("no json here")
