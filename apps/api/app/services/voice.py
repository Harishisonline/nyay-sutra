"""Speech-to-text and text-to-speech.

Bhashini (ULCA pipeline API) handles Marathi, Hindi and Hinglish, and is tried first for English.
Whisper large-v3 on the HuggingFace Inference API is the English fallback. Audio bytes are held
in memory only for the duration of the request and never written to disk or the database."""

from __future__ import annotations

import base64
import time
from dataclasses import dataclass
from typing import Any

import httpx
import structlog

from app.config import get_settings
from app.core.errors import ProblemError

log = structlog.get_logger()

BHASHINI_CONFIG_URL = "https://meity-auth.ulcacontrib.org/ulca/apis/v0/model/getModelsPipeline"
LANG_CODES = {"english": "en", "hinglish": "hi", "marathi": "mr", "hindi": "hi"}
WHISPER_URL = "https://router.huggingface.co/hf-inference/models/openai/whisper-large-v3"


@dataclass
class Transcript:
    text: str
    language: str
    confidence: float
    provider: str
    duration_ms: int


def bhashini_configured() -> bool:
    s = get_settings()
    return bool(s.bhashini_api_key and s.bhashini_user_id)


def whisper_configured() -> bool:
    return bool(get_settings().huggingface_api_key)


def describe() -> str:
    parts = []
    if bhashini_configured():
        parts.append("bhashini")
    if whisper_configured():
        parts.append("whisper (english)")
    return " + ".join(parts) if parts else "not configured"


async def _bhashini_pipeline(task: str, source_lang: str) -> tuple[str, str, dict[str, Any]]:
    """Resolve the inference endpoint and service id for one task via the pipeline config API."""
    s = get_settings()
    async with httpx.AsyncClient(timeout=15) as client:
        res = await client.post(
            BHASHINI_CONFIG_URL,
            headers={"userID": s.bhashini_user_id or "", "ulcaApiKey": s.bhashini_api_key or ""},
            json={
                "pipelineTasks": [{"taskType": task, "config": {"language": {"sourceLanguage": source_lang}}}],
                "pipelineRequestConfig": {"pipelineId": s.bhashini_pipeline_id},
            },
        )
    if res.status_code != 200:
        raise ProblemError(502, "Bhashini configuration lookup failed.", slug="voice-upstream")
    data = res.json()
    endpoint = data["pipelineInferenceAPIEndPoint"]
    url = endpoint["callbackUrl"]
    auth_name = endpoint["inferenceApiKey"]["name"]
    auth_value = endpoint["inferenceApiKey"]["value"]
    service_id = data["pipelineResponseConfig"][0]["config"][0]["serviceId"]
    return url, service_id, {auth_name: auth_value}


async def _bhashini_stt(audio: bytes, language: str) -> Transcript:
    code = LANG_CODES[language]
    started = time.perf_counter()
    url, service_id, headers = await _bhashini_pipeline("asr", code)
    payload = {
        "pipelineTasks": [{
            "taskType": "asr",
            "config": {"language": {"sourceLanguage": code}, "serviceId": service_id, "audioFormat": "webm",
                       "samplingRate": 16000},
        }],
        "inputData": {"audio": [{"audioContent": base64.b64encode(audio).decode()}]},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(url, headers=headers, json=payload)
    if res.status_code != 200:
        raise ProblemError(502, "Could not transcribe. Try typing instead.", slug="voice-upstream")
    text = res.json()["pipelineResponse"][0]["output"][0]["source"]
    return Transcript(text.strip(), language, 0.9, "bhashini", int((time.perf_counter() - started) * 1000))


async def _whisper_stt(audio: bytes) -> Transcript:
    s = get_settings()
    started = time.perf_counter()
    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.post(
            WHISPER_URL,
            headers={"Authorization": f"Bearer {s.huggingface_api_key}", "Content-Type": "audio/webm"},
            content=audio,
        )
    if res.status_code != 200:
        raise ProblemError(502, "Could not transcribe. Try typing instead.", slug="voice-upstream")
    text = str(res.json().get("text", "")).strip()
    return Transcript(text, "english", 0.85, "whisper", int((time.perf_counter() - started) * 1000))


async def transcribe(audio: bytes, language: str) -> Transcript:
    try:
        if bhashini_configured():
            try:
                return await _bhashini_stt(audio, language)
            except ProblemError:
                if language != "english" or not whisper_configured():
                    raise
                log.warning("bhashini_stt_failed_falling_back_to_whisper")
        if language == "english" and whisper_configured():
            return await _whisper_stt(audio)
    finally:
        del audio
    raise ProblemError(
        503,
        "Voice input is not configured on this server yet. Type your question instead.",
        slug="voice-not-configured",
    )


async def synthesize(text: str, language: str) -> bytes:
    if not bhashini_configured():
        raise ProblemError(503, "Voice playback is not configured on this server yet.", slug="voice-not-configured")
    code = LANG_CODES[language]
    url, service_id, headers = await _bhashini_pipeline("tts", code)
    payload = {
        "pipelineTasks": [{
            "taskType": "tts",
            "config": {"language": {"sourceLanguage": code}, "serviceId": service_id, "gender": "female",
                       "samplingRate": 8000},
        }],
        "inputData": {"input": [{"source": text}]},
    }
    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.post(url, headers=headers, json=payload)
    if res.status_code != 200:
        raise ProblemError(502, "Could not generate audio right now.", slug="voice-upstream")
    content = res.json()["pipelineResponse"][0]["audio"][0]["audioContent"]
    return base64.b64decode(content)
