from __future__ import annotations

import re
from datetime import UTC, datetime
from typing import Any, Literal

from fastapi import APIRouter
from fastapi.responses import HTMLResponse
from sqlalchemy import select

from app.api.v1.deps import chat_title, owned_chat, owned_draft
from app.config import get_settings
from app.core.errors import ProblemError
from app.core.ratelimit import limiter
from app.core.security import CurrentUser, DbSession
from app.db.models import Draft, DraftVersion
from app.models import schemas as s
from app.services import draft_writer
from app.services.serializers import draft_out, version_out

router = APIRouter(prefix="/drafts", tags=["drafts"])

_CATEGORY_TEMPLATE = {"tenancy": "tenancy", "consumer": "consumer", "health": "consumer", "rti": "rti"}


async def _out(db: DbSession, d: Draft) -> s.DraftOut:
    return draft_out(d, await chat_title(db, d.source_chat_session_id))


@router.get("", response_model=list[s.DraftOut])
async def list_drafts(user: CurrentUser, db: DbSession, status: str | None = None,
                      category: str | None = None) -> list[s.DraftOut]:
    stmt = select(Draft).where(Draft.user_id == user.id, Draft.deleted_at.is_(None))
    if status:
        stmt = stmt.where(Draft.status == status)
    if category:
        stmt = stmt.where(Draft.category == category)
    drafts = (await db.scalars(stmt.order_by(Draft.updated_at.desc()))).all()
    return [await _out(db, d) for d in drafts]


@router.post("", response_model=s.DraftOut, status_code=201)
async def create_draft(body: s.DraftCreate, user: CurrentUser, db: DbSession) -> s.DraftOut:
    language = body.language or user.preferred_language
    if body.from_chat_id:
        chat = await owned_chat(db, user, body.from_chat_id)
        answers = [m for m in chat.messages if m.role == "assistant" and not m.was_low_confidence]
        if not answers:
            raise ProblemError(422, "This chat has no verified answer to turn into a draft yet.", slug="validation")
        last = answers[-1]
        question = next((m.content for m in reversed(chat.messages)
                         if m.role == "user" and m.created_at <= last.created_at), chat.title or "")
        citations = [s.CitationOut(index=c.position, act_id=c.act_id, act_name=c.act_name, section=c.section,
                                   section_title=c.section_title or "", excerpt=c.excerpt or "",
                                   source_url=c.source_url).model_dump() for c in last.citations]
        template = _CATEGORY_TEMPLATE.get(chat.category)
        tpl = draft_writer.TEMPLATES.get(template or "generic", draft_writer.TEMPLATES["generic"])
        draft = Draft(
            user_id=user.id,
            source_chat_session_id=chat.id,
            title=(body.title or f"Notice: {chat.title or 'from chat'}")[:120],
            recipient=tpl["recipient"] or None,
            subject=tpl["subject"] or (chat.title or None),
            body=draft_writer.body_from_chat(question, last.content, citations),
            language=chat.frozen_language if body.language is None else language,
            template=template,
            category=chat.category,
            citations=citations,
        )
        source = "from_chat"
    else:
        key = body.template or "generic"
        tpl = draft_writer.TEMPLATES[key]
        draft = Draft(
            user_id=user.id,
            title=(body.title or tpl["title"])[:120],
            recipient=tpl["recipient"] or None,
            subject=tpl["subject"] or None,
            body=tpl["body"] or " ",
            language=language,
            template=key,
            category=tpl["category"],
            citations=[],
        )
        source = "template"
    db.add(draft)
    await db.flush()
    db.add(DraftVersion(draft_id=draft.id, body=draft.body, source=source))
    await db.commit()
    return await _out(db, draft)


@router.get("/{draft_id}", response_model=s.DraftOut)
async def get_draft(draft_id: str, user: CurrentUser, db: DbSession) -> s.DraftOut:
    return await _out(db, await owned_draft(db, user, draft_id))


@router.patch("/{draft_id}", response_model=s.DraftOut)
async def update_draft(draft_id: str, body: s.DraftUpdate, user: CurrentUser, db: DbSession) -> s.DraftOut:
    draft = await owned_draft(db, user, draft_id)
    patch = body.model_dump(exclude_unset=True)
    if draft.status == "sent" and set(patch) - {"title"}:
        raise ProblemError(409, "This draft was marked as sent and can no longer be edited.", slug="draft-sent")
    for key, value in patch.items():
        if key in ("title", "body") and value is None:
            continue
        setattr(draft, key, value)
    draft.updated_at = datetime.now(UTC)
    await db.commit()
    return await _out(db, draft)


@router.delete("/{draft_id}", status_code=204)
async def delete_draft(draft_id: str, user: CurrentUser, db: DbSession) -> None:
    draft = await owned_draft(db, user, draft_id)
    draft.deleted_at = datetime.now(UTC)
    await db.commit()


@router.post("/{draft_id}/mark-sent", response_model=s.DraftOut)
async def mark_sent(draft_id: str, user: CurrentUser, db: DbSession) -> s.DraftOut:
    draft = await owned_draft(db, user, draft_id)
    now = datetime.now(UTC)
    draft.status = "sent"
    draft.sent_at = now
    draft.updated_at = now
    await db.commit()
    return await _out(db, draft)


@router.get("/{draft_id}/versions", response_model=list[s.DraftVersionOut])
async def versions(draft_id: str, user: CurrentUser, db: DbSession) -> list[s.DraftVersionOut]:
    draft = await owned_draft(db, user, draft_id)
    rows = await db.scalars(
        select(DraftVersion).where(DraftVersion.draft_id == draft.id).order_by(DraftVersion.created_at.desc())
    )
    return [version_out(v) for v in rows]


@router.post("/{draft_id}/improve", response_model=s.DraftOut)
async def improve(draft_id: str, body: s.ImproveRequest, user: CurrentUser, db: DbSession) -> s.DraftOut:
    limiter.check(f"improve:{user.id}", get_settings().rate_improve_per_hour, 3600)
    draft = await owned_draft(db, user, draft_id)
    if draft.status == "sent":
        raise ProblemError(409, "This draft was marked as sent and can no longer be edited.", slug="draft-sent")
    first = await db.scalar(
        select(DraftVersion).where(DraftVersion.draft_id == draft.id).order_by(DraftVersion.created_at).limit(1)
    )
    citations: list[dict[str, Any]] = list(draft.citations or [])
    result = await draft_writer.improve(body.action, draft.body, draft.language, citations, body.prompt,
                                        first.body if first else None)
    db.add(DraftVersion(draft_id=draft.id, body=draft.body, source="user_edit"))
    draft.body = result.body
    draft.updated_at = datetime.now(UTC)
    db.add(DraftVersion(draft_id=draft.id, body=result.body, source=body.action, prompt=body.prompt,
                        model_provider=result.provider, model_name=result.model))
    await db.commit()
    return await _out(db, draft)


def _filename(title: str) -> str:
    slug = re.sub(r"[^a-zA-Z0-9]+", "-", title).strip("-").lower()[:60] or "draft"
    return f"draft-{slug}.html"


@router.get("/{draft_id}/download", response_class=HTMLResponse)
async def download(draft_id: str, user: CurrentUser, db: DbSession,
                   format: Literal["html", "pdf", "inline"] = "html") -> HTMLResponse:
    draft = await owned_draft(db, user, draft_id)
    place = ", ".join(p for p in (user.area, user.district, user.state) if p) or None
    anonymous = user.anonymous_by_default
    html_doc = draft_writer.render_download(draft.title, draft.recipient, draft.subject, draft.body,
                                            None if anonymous else user.name,
                                            None if anonymous else user.phone, place, draft.language)
    disposition = "inline" if format == "inline" else "attachment"
    headers = {"Content-Disposition": f'{disposition}; filename="{_filename(draft.title)}"'}
    return HTMLResponse(html_doc, headers=headers)
