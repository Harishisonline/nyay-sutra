"""LLM provider abstraction: Groq first, Gemini 2.0 Flash on 429 / 5xx / timeout.

Groq no longer serves llama-3.3-70b-versatile on free accounts. The default model is
openai/gpt-oss-120b, which is on the current free model list and returns JSON.

Both providers are asked for a JSON object. If neither key is configured and the app is not in
production, callers fall back to the offline extractive path in rag.py / draft_writer.py, which is
labelled `offline` everywhere it surfaces."""

from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass
from typing import Any, Protocol

import httpx
import structlog

from app.config import get_settings

log = structlog.get_logger()


class LLMUnavailable(Exception):
    """No configured provider could produce a response."""


class ProviderError(Exception):
    def __init__(self, provider: str, status: int | None, message: str) -> None:
        super().__init__(f"{provider}: {status} {message}")
        self.provider = provider
        self.status = status

    @property
    def retryable(self) -> bool:
        return self.status is None or self.status == 429 or self.status >= 500


@dataclass
class LLMResult:
    provider: str
    model: str
    text: str
    latency_ms: int
    fallback_used: bool

    def json(self) -> dict[str, Any]:
        return parse_json_object(self.text)


class Provider(Protocol):
    name: str
    model: str

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str: ...


class GroqProvider:
    name = "groq"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        self.model = model
        self._key = api_key
        self._timeout = timeout

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str:
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self._key}"},
                    json={
                        "model": self.model,
                        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                        "temperature": temperature,
                        "max_tokens": max_tokens,
                        "response_format": {"type": "json_object"},
                    },
                )
        except httpx.HTTPError as exc:
            raise ProviderError(self.name, None, type(exc).__name__) from exc
        if res.status_code != 200:
            raise ProviderError(self.name, res.status_code, res.text[:200])
        return str(res.json()["choices"][0]["message"]["content"])


class GeminiProvider:
    name = "gemini"

    def __init__(self, api_key: str, model: str, timeout: float) -> None:
        self.model = model
        self._key = api_key
        self._timeout = timeout

    async def complete(self, system: str, user: str, *, temperature: float, max_tokens: int) -> str:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{self.model}:generateContent"
        try:
            async with httpx.AsyncClient(timeout=self._timeout) as client:
                res = await client.post(
                    url,
                    headers={"x-goog-api-key": self._key},
                    json={
                        "systemInstruction": {"parts": [{"text": system}]},
                        "contents": [{"role": "user", "parts": [{"text": user}]}],
                        "generationConfig": {
                            "temperature": temperature,
                            "maxOutputTokens": max_tokens,
                            "responseMimeType": "application/json",
                        },
                    },
                )
        except httpx.HTTPError as exc:
            raise ProviderError(self.name, None, type(exc).__name__) from exc
        if res.status_code != 200:
            raise ProviderError(self.name, res.status_code, res.text[:200])
        data = res.json()
        try:
            return str(data["candidates"][0]["content"]["parts"][0]["text"])
        except (KeyError, IndexError) as exc:
            raise ProviderError(self.name, 502, "empty candidate") from exc


_providers_override: list[Provider] | None = None


def set_providers_for_tests(providers: list[Provider] | None) -> None:
    global _providers_override
    _providers_override = providers


def configured_providers() -> list[Provider]:
    if _providers_override is not None:
        return _providers_override
    s = get_settings()
    out: list[Provider] = []
    if s.groq_api_key:
        out.append(GroqProvider(s.groq_api_key, s.groq_model, s.llm_timeout_seconds))
    if s.gemini_api_key:
        out.append(GeminiProvider(s.gemini_api_key, s.gemini_model, s.llm_timeout_seconds))
    return out


def describe_providers() -> str:
    names = [f"{p.name}:{p.model}" for p in configured_providers()]
    if names:
        return " -> ".join(names)
    return "offline extractive (no LLM key)" if get_settings().offline_llm_enabled else "not configured"


async def generate(system: str, user: str, *, temperature: float = 0.2, max_tokens: int = 900) -> LLMResult:
    """Try each provider in order. Retryable failures (429, 5xx, network) move on to the next."""
    providers = configured_providers()
    if not providers:
        raise LLMUnavailable("No LLM provider configured")
    last: ProviderError | None = None
    for i, provider in enumerate(providers):
        start = time.perf_counter()
        try:
            text = await provider.complete(system, user, temperature=temperature, max_tokens=max_tokens)
        except ProviderError as exc:
            log.warning("llm_provider_failed", provider=provider.name, status=exc.status)
            last = exc
            if exc.retryable:
                continue
            raise LLMUnavailable(str(exc)) from exc
        return LLMResult(
            provider=provider.name,
            model=provider.model,
            text=text,
            latency_ms=int((time.perf_counter() - start) * 1000),
            fallback_used=i > 0,
        )
    raise LLMUnavailable(str(last) if last else "All providers failed")


_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def parse_json_object(text: str) -> dict[str, Any]:
    cleaned = _FENCE.sub("", text.strip())
    start, end = cleaned.find("{"), cleaned.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object in model output")
    obj = json.loads(cleaned[start : end + 1])
    if not isinstance(obj, dict):
        raise ValueError("Model output is not a JSON object")
    return obj
