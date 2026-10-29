from __future__ import annotations

import re
from typing import Any, cast

from app.db.client import as_utc
from app.db.models import ChatMessage, ChatSession, Citation, Draft, DraftVersion, User
from app.models import schemas as s


def user_out(u: User) -> s.UserProfile:
    return s.UserProfile(
        id=str(u.id),
        phone=u.phone,
        email=u.email,
        name=u.name,
        age=u.age,
        gender=cast(s.Gender | None, u.gender),
        state=u.state,
        district=u.district,
        area=u.area,
        preferred_language=cast(s.Language, u.preferred_language),
        preferred_voice_language=cast(s.Language, u.preferred_voice_language),
        voice_playback=u.voice_playback,
        onboarding_completed=u.onboarding_completed,
        aadhaar_last4=u.aadhaar_last4,
        created_at=as_utc(u.created_at),
        notifications=s.NotificationPrefs(
            legal_updates=u.notif_legal_updates,
            email_digest=u.notif_email_digest,
            sms_reminders=u.notif_sms_reminders,
            state_schemes=u.notif_state_schemes,
            weekly_digest=u.notif_weekly_digest,
            chat_reminders=u.notif_chat_reminders,
            quiet_hours_start=u.quiet_hours_start,
            quiet_hours_end=u.quiet_hours_end,
        ),
        privacy=s.PrivacyPrefs(
            anonymous_by_default=u.anonymous_by_default,
            save_chat_history=u.save_chat_history,
            help_improve=u.help_improve,
            use_profile_personalisation=u.use_profile_personalisation,
            retention_days=u.retention_days,
        ),
    )


def citation_out(c: Citation) -> s.CitationOut:
    return s.CitationOut(
        index=c.position,
        act_id=c.act_id,
        act_name=c.act_name,
        section=c.section,
        section_title=c.section_title or "",
        excerpt=c.excerpt or "",
        source_url=c.source_url,
    )


def citation_from_dict(d: dict[str, Any]) -> s.CitationOut:
    return s.CitationOut.model_validate(d)


def message_out(m: ChatMessage) -> s.ChatMessageOut:
    return s.ChatMessageOut(
        id=str(m.id),
        role=cast(Any, m.role),
        content=m.content,
        created_at=as_utc(m.created_at),
        category=cast(Any, m.category),
        confidence=m.confidence,
        model_provider=cast(Any, m.model_provider),
        model_name=m.model_name,
        latency_ms=m.latency_ms,
        retrieval_top_score=m.retrieval_top_score,
        was_low_confidence=m.was_low_confidence,
        language=cast(Any, m.language),
        transcript_language=cast(Any, m.transcript_language),
        transcript_confidence=m.transcript_confidence,
        citations=[citation_out(c) for c in m.citations],
    )


_MARKER = re.compile(r"\s*\[\d{1,2}\]")


def plain_text(text: str) -> str:
    """Answer markdown as one plain line: no bold markers, bullets, citation markers or lead-in line."""
    lines = [ln.strip() for ln in text.strip().splitlines() if ln.strip()]
    if len(lines) > 1 and lines[0].endswith(":"):
        lines = lines[1:]
    lines = [ln[2:] if ln.startswith("- ") else ln for ln in lines]
    return " ".join(_MARKER.sub("", " ".join(lines)).replace("**", "").split())


def _snippet(text: str, limit: int = 220) -> str:
    flat = plain_text(text)
    return flat if len(flat) <= limit else flat[: limit - 1].rstrip() + "\u2026"


def chat_summary(chat: ChatSession, draft_status: str | None) -> s.ChatSummary:
    msgs = list(chat.messages)
    user_msgs = [m for m in msgs if m.role == "user"]
    answers = [m for m in msgs if m.role == "assistant" and not m.was_low_confidence]
    last_answer = answers[-1] if answers else None
    sources = {(c.act_id, c.section) for m in answers for c in m.citations}
    if last_answer is not None:
        snippet = _snippet(last_answer.content)
    elif msgs and msgs[-1].was_low_confidence:
        snippet = "NYAY-SUTRA could not verify an answer to this question."
    else:
        snippet = _snippet(user_msgs[-1].content) if user_msgs else ""
    return s.ChatSummary(
        id=str(chat.id),
        title=chat.title or "Untitled chat",
        category=cast(s.Category, chat.category),
        pinned=chat.pinned,
        context=s.FrozenContext(
            state=chat.frozen_state,
            city=chat.frozen_city,
            age=chat.frozen_age,
            language=cast(s.Language, chat.frozen_language),
            frozen_at=as_utc(chat.created_at),
        ),
        created_at=as_utc(chat.created_at),
        last_activity_at=as_utc(chat.last_activity_at),
        snippet=snippet,
        follow_ups=max(0, len(user_msgs) - 1),
        sources=len(sources),
        draft_status=cast(Any, draft_status),
    )


def chat_detail(chat: ChatSession, draft_status: str | None) -> s.ChatDetail:
    summary = chat_summary(chat, draft_status)
    return s.ChatDetail(
        **summary.model_dump(),
        messages=[message_out(m) for m in chat.messages if m.role in ("user", "assistant")],
    )


def draft_out(d: Draft, source_title: str | None) -> s.DraftOut:
    return s.DraftOut(
        id=str(d.id),
        title=d.title,
        recipient=d.recipient,
        subject=d.subject,
        body=d.body,
        language=cast(s.Language, d.language),
        template=cast(Any, d.template),
        category=cast(s.Category, d.category),
        status=cast(s.DraftStatus, d.status),
        source_chat_id=str(d.source_chat_session_id) if d.source_chat_session_id else None,
        source_chat_title=source_title,
        citations=[citation_from_dict(c) for c in (d.citations or [])],
        created_at=as_utc(d.created_at),
        updated_at=as_utc(d.updated_at),
        sent_at=as_utc(d.sent_at) if d.sent_at else None,
    )


def version_out(v: DraftVersion) -> s.DraftVersionOut:
    return s.DraftVersionOut(
        id=str(v.id),
        source=v.source,
        prompt=v.prompt,
        model_provider=cast(Any, v.model_provider),
        body=v.body,
        created_at=as_utc(v.created_at),
    )
