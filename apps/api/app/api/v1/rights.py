from __future__ import annotations

from typing import cast

from fastapi import APIRouter

from app.core.errors import not_found
from app.core.security import CurrentUser
from app.models import schemas as s
from app.services.corpus import CategoryInfo, get_corpus

router = APIRouter(prefix="/rights", tags=["rights"])


def _category(c: CategoryInfo) -> s.RightCategory:
    corpus = get_corpus()
    sections = corpus.sections_in(c.id)
    act_ids = list(dict.fromkeys(sec.act_id for sec in sections))
    acts = [
        s.RightAct(
            act_id=a,
            short_name=corpus.act(a).short_name,
            full_name=corpus.act(a).full_name,
            sections=sum(1 for sec in sections if sec.act_id == a),
            official_url=corpus.act(a).official_url,
        )
        for a in act_ids
    ]
    return s.RightCategory(
        id=cast(s.Category, c.id),
        title=c.title,
        summary=c.summary,
        icon=c.icon,
        acts=acts,
        section_count=len(sections),
        sample_questions=list(c.sample_questions),
    )


@router.get("", response_model=list[s.RightCategory])
async def list_rights(_: CurrentUser, q: str | None = None) -> list[s.RightCategory]:
    corpus = get_corpus()
    out = [_category(c) for c in corpus.categories]
    if not q or not q.strip():
        return out
    term = q.strip().lower()

    def matches(rc: s.RightCategory) -> bool:
        if term in rc.title.lower() or term in rc.summary.lower():
            return True
        if any(term in a.full_name.lower() or term in a.short_name.lower() for a in rc.acts):
            return True
        return any(term in sec.title.lower() or term in sec.keywords.lower()
                   for sec in corpus.sections_in(rc.id))

    return [rc for rc in out if matches(rc)]


@router.get("/{category}", response_model=s.RightCategoryDetail)
async def get_right(category: str, _: CurrentUser) -> s.RightCategoryDetail:
    corpus = get_corpus()
    info = next((c for c in corpus.categories if c.id == category), None)
    if info is None:
        raise not_found("Category")
    base = _category(info)
    sections = [
        s.RightSection(
            act_id=sec.act_id,
            act_name=corpus.act(sec.act_id).full_name,
            section=sec.section,
            title=sec.title,
            body=sec.body,
            source_url=corpus.act(sec.act_id).official_url,
        )
        for sec in corpus.sections_in(category)
    ]
    return s.RightCategoryDetail(**base.model_dump(), sections=sections)
