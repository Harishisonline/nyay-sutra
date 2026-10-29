from __future__ import annotations

from typing import Annotated, Literal, cast

from fastapi import APIRouter, File, Form, UploadFile
from fastapi.responses import Response

from app.core.errors import ProblemError
from app.core.security import CurrentUser
from app.models import schemas as s
from app.services import voice

router = APIRouter(prefix="/voice", tags=["voice"])

MAX_AUDIO_BYTES = 2 * 1024 * 1024
PREVIEW_TEXT = {
    "english": "Your landlord cannot cut your water supply without just cause.",
    "hinglish": "Aapka landlord bina wajah paani ki supply nahi kaat sakta.",
    "marathi": "तुमचे घरमालक योग्य कारणाशिवाय पाणीपुरवठा बंद करू शकत नाहीत.",
    "hindi": "आपका मकान मालिक बिना उचित कारण पानी की आपूर्ति नहीं काट सकता।",
}


@router.post("/transcribe", response_model=s.TranscribeResponse)
async def transcribe(_: CurrentUser, audio: Annotated[UploadFile, File()],
                     language: Annotated[s.Language, Form()] = "english") -> s.TranscribeResponse:
    data = await audio.read(MAX_AUDIO_BYTES + 1)
    await audio.close()
    if len(data) > MAX_AUDIO_BYTES:
        raise ProblemError(413, "Recording is too long. Keep it under 30 seconds.")
    if not data:
        raise ProblemError(422, "No audio received. Try recording again.", slug="validation")
    result = await voice.transcribe(data, language)
    if not result.text:
        raise ProblemError(422, "Could not hear a question. Try again or type instead.", slug="empty-transcript")
    return s.TranscribeResponse(
        text=result.text,
        language=cast(s.Language, result.language),
        confidence=result.confidence,
        provider=cast(Literal["bhashini", "whisper"], result.provider),
        duration_ms=result.duration_ms,
    )


@router.get("/tts")
async def tts(_: CurrentUser, text: str, language: s.Language = "english") -> Response:
    if not text.strip():
        raise ProblemError(422, "Nothing to read out.", slug="validation")
    audio = await voice.synthesize(text[:900], language)
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "no-store"})


@router.get("/preview")
async def preview(_: CurrentUser, language: s.Language = "english") -> Response:
    audio = await voice.synthesize(PREVIEW_TEXT[language], language)
    return Response(audio, media_type="audio/wav", headers={"Cache-Control": "private, max-age=3600"})
