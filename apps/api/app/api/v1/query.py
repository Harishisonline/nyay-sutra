from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import cast

from fastapi import APIRouter, Request

from app.api.v1.deps import owned_chat
from app.config import get_settings
from app.core.errors import ProblemError
from app.core.ratelimit import limiter
from app.core.security import CurrentUser, DbSession
from app.db.models import ChatMessage, ChatSession, Citation, ErrorLog, User
from app.models import schemas as s
from app.services import llm, rag
from app.services.serializers import message_out

router = APIRouter(tags=["query"])

LOW_CONFIDENCE_TEXT = "NYAY-SUTRA could not verify this answer."


def freeze_context(user: User, language: str) -> ChatSession:
    """Snapshot the profile onto the chat row. Later profile edits never touch this chat."""
    personalise = user.use_profile_personalisation
    city = ", ".join(p for p in (user.district, user.area) if p) or None
    return ChatSession(
        user_id=user.id,
        frozen_state=user.state,
        frozen_city=city if personalise else None,
        frozen_age=user.age if personalise else None,
        frozen_language=language,
        category="other",
        messages=[],
    )


def diagnostic_out(log: ErrorLog) -> s.Diagnostic:
    from app.db.client import as_utc

    return s.Diagnostic(
        trace_id=log.trace_id,
        kind=cast(s.DiagnosticKind, log.kind),
        question=log.question or "",
        retrieval_top_score=round(log.retrieval_top_score or 0.0, 3),
        threshold=get_settings().retrieval_threshold,
        retrieval_preview=[s.RetrievalPreviewItem.model_validate(p) for p in (log.retrieval_preview or [])],
        model_flag=log.model_flag,
        valid_citations=log.valid_citations,
        model_provider=cast(s.ModelProvider | None, log.model_provider),
        model_name=log.model_name,
        latency_ms=log.latency_ms,
        created_at=as_utc(log.created_at),
    )


@router.post("/query", response_model=s.QueryAnswered | s.QueryLowConfidence)
async def query(body: s.QueryRequest, request: Request, user: CurrentUser,
                db: DbSession) -> s.QueryAnswered | s.QueryLowConfidence:
    settings = get_settings()
    limiter.check(f"query:{user.id}", settings.rate_query_per_min, 60)

    if body.chat_id:
        chat = await owned_chat(db, user, body.chat_id)
    else:
        chat = freeze_context(user, body.language or user.preferred_language)
        db.add(chat)
        await db.flush()

    language = body.language or chat.frozen_language
    history: list[tuple[str, str]] = []
    pending_q: str | None = None
    for m in chat.messages:
        if m.role == "user":
            pending_q = m.content
        elif m.role == "assistant" and pending_q and not m.was_low_confidence:
            history.append((pending_q, m.content))
            pending_q = None

    ctx = rag.ChatContext(chat.frozen_state, chat.frozen_city, chat.frozen_age, chat.frozen_language)
    try:
        result = await rag.answer(body.question, language, ctx, history)
    except llm.LLMUnavailable as exc:
        raise ProblemError(503, "The answer service is not configured or is down. Try again shortly.",
                           slug="llm-unavailable") from exc

    now = datetime.now(UTC)
    user_msg = ChatMessage(
        chat_session_id=chat.id,
        role="user",
        content=body.question,
        language=language,
        transcript_language=body.transcript_language,
        transcript_confidence=body.transcript_confidence,
        created_at=now,
    )
    db.add(user_msg)
    assistant = ChatMessage(
        chat_session_id=chat.id,
        role="assistant",
        content=result.answer if result.answered else LOW_CONFIDENCE_TEXT,
        language=language,
        category=result.category,
        confidence=result.confidence,
        model_provider=result.provider,
        model_name=result.model,
        latency_ms=result.latency_ms,
        retrieval_top_score=result.top_score,
        was_low_confidence=not result.answered,
        created_at=datetime.now(UTC),
    )
    db.add(assistant)
    await db.flush()
    if not chat.title:
        chat.title = result.title if result.answered and result.title else rag.short_title(body.question, 80)
    if result.answered and (chat.category == "other" or not history):
        chat.category = result.category
    chat.last_activity_at = datetime.now(UTC)

    if result.answered:
        for c in result.citations:
            db.add(Citation(chat_message_id=assistant.id, position=c.index, act_id=c.act_id, act_name=c.act_name,
                            section=c.section, section_title=c.section_title, excerpt=c.excerpt,
                            source_url=c.source_url, language="english"))
        await db.commit()
        await db.refresh(assistant, ["citations"])
        await db.refresh(user_msg, ["citations"])
        return s.QueryAnswered(chat_id=str(chat.id), user_message=message_out(user_msg),
                               message=message_out(assistant))

    trace_id = f"req_{secrets.token_hex(4)}"
    request_id = getattr(request.state, "request_id", None)
    log = ErrorLog(
        user_id=user.id,
        chat_session_id=chat.id,
        chat_message_id=assistant.id,
        kind=result.kind or "low_confidence",
        trace_id=trace_id,
        question=body.question,
        retrieval_top_score=result.top_score,
        retrieval_preview=result.preview,
        model_flag=result.model_flag,
        valid_citations=result.valid_citations,
        trace={**result.trace, "request_id": request_id},
        model_provider=result.provider,
        model_name=result.model,
        latency_ms=result.latency_ms,
    )
    db.add(log)
    await db.commit()
    return s.QueryLowConfidence(chat_id=str(chat.id), message_id=str(assistant.id), diagnostic=diagnostic_out(log))
