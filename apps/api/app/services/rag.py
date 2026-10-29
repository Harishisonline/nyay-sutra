"""Query pipeline: embed -> retrieve -> rerank -> generate -> validate.

A cited answer is returned when the top score is at least RELATED_FLOOR, the model did not
flag uncertainty, at least MIN_VALID_CITATIONS citations survive validation against the corpus,
and the combined confidence is at least CONFIDENCE_THRESHOLD. A weaker match still gets
practical steps and a link to India Code, without naming a statute that was not retrieved.
Anything else becomes a low-confidence result that the API routes to the AI error page."""

from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass, field
from typing import Any, Literal

import structlog

from app.config import get_settings
from app.services import llm
from app.services.corpus import Act, Section, get_corpus, normalise_section
from app.services.embeddings import get_embedder
from app.services.reranker import rerank
from app.services.vector_store import get_vector_store

log = structlog.get_logger()

Kind = Literal["low_confidence", "model_refused", "citation_missing"]

LANGUAGE_INSTRUCTIONS = {
    "english": "simple, plain English that a school student can follow",
    "hinglish": "Hinglish: conversational Hindi written in Latin script, mixed with common English words",
    "marathi": "Marathi in Devanagari script, simple everyday words",
    "hindi": "Hindi in Devanagari script, simple everyday words",
}

CATEGORY_IDS = ("tenancy", "consumer", "women_child", "rti", "health", "wages", "education", "criminal",
                "family", "cyber", "other")

# Calibrated multilingual-e5 scores: off-topic questions peak near 0.20, and a real
# section match on this corpus can sit near 0.40. Below this floor the chunks are
# noise, so they are not cited as the governing law.
RELATED_FLOOR = 0.30
INDIA_CODE_URL = "https://www.indiacode.nic.in/"


@dataclass(frozen=True)
class ChatContext:
    state: str | None
    city: str | None
    age: int | None
    language: str


@dataclass
class Chunk:
    n: int
    section: Section
    act: Act
    cosine: float
    score: float

    def preview(self) -> dict[str, Any]:
        return {
            "act_id": self.act.id,
            "act_name": self.act.full_name,
            "section": self.section.section,
            "title": self.section.title,
            "score": round(self.score, 2),
            "source_url": self.act.official_url,
        }


@dataclass
class CitationData:
    index: int
    act_id: str
    act_name: str
    section: str
    section_title: str
    excerpt: str
    source_url: str | None


@dataclass
class RagResult:
    answered: bool
    answer: str = ""
    title: str = ""
    category: str = "other"
    citations: list[CitationData] = field(default_factory=list)
    confidence: float = 0.0
    top_score: float = 0.0
    provider: str | None = None
    model: str | None = None
    latency_ms: int = 0
    kind: Kind | None = None
    model_flag: str | None = None
    valid_citations: int = 0
    preview: list[dict[str, Any]] = field(default_factory=list)
    trace: dict[str, Any] = field(default_factory=dict)


async def retrieve(question: str, ctx: ChatContext) -> tuple[list[Chunk], str]:
    s = get_settings()
    corpus = get_corpus()
    embedder = get_embedder()
    [vector] = await asyncio.to_thread(embedder.embed_queries, [question])
    hits = await get_vector_store().search(vector, s.retrieval_top_k)
    if ctx.state and ctx.state != "Maharashtra":
        hits = [h for h in hits if corpus.acts.get(h.act_id) and corpus.acts[h.act_id].jurisdiction == "central"]
    hits, reranker_name = await rerank(question, hits)
    chunks: list[Chunk] = []
    for h in hits:
        section = corpus.get(h.act_id, h.section)
        if section is None:
            continue
        chunks.append(Chunk(len(chunks) + 1, section, corpus.act(h.act_id), h.cosine, embedder.calibrate(h.cosine)))
    if reranker_name == "none":
        chunks.sort(key=lambda c: c.score, reverse=True)
        for i, c in enumerate(chunks):
            c.n = i + 1
    return chunks, reranker_name


def _context_block(chunks: list[Chunk]) -> str:
    return "\n\n".join(
        f"[{c.n}] {c.act.full_name}, Section {c.section.section} ({c.section.title})\n{c.section.body}"
        for c in chunks
    )


def _profile_line(ctx: ChatContext) -> str:
    parts = []
    if ctx.city or ctx.state:
        parts.append(f"lives in {', '.join(p for p in (ctx.city, ctx.state) if p)}")
    if ctx.age:
        parts.append(f"age {ctx.age}")
        if ctx.age < 18:
            parts.append("is a minor, so prefer child-protection and education provisions where relevant")
        elif ctx.age >= 60:
            parts.append("is a senior citizen")
    return "The user " + "; ".join(parts) + "." if parts else "No profile context."


def build_prompt(question: str, chunks: list[Chunk], ctx: ChatContext, language: str,
                 history: list[tuple[str, str]]) -> tuple[str, str]:
    lang = LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["english"])
    system = (
        "You are NYAY-SUTRA, a legal rights awareness assistant for citizens of India, focused on Maharashtra. "
        "You answer ONLY from the numbered SOURCES provided. Rules:\n"
        "1. Every sentence that states what the law says must end with a citation marker such as [1] or [2] "
        "pointing to a SOURCES number. Never cite a number that is not in SOURCES. Never mention a law that is "
        "not in SOURCES.\n"
        "2. When SOURCES lists two or more items, citations must contain at least two different source numbers, "
        "and the answer must include both markers. Choose the two sources that bear most on the question. "
        "If the second source is only partly related, say that plainly instead of citing only one.\n"
        "3. If the SOURCES only partly apply, still answer from the parts that apply, say what they do not "
        "cover, and give next steps. Set uncertain to true only when none of the sources are about the "
        "question at all.\n"
        f"4. Write the answer in {lang}. Keep Act names and section numbers in English.\n"
        "5. Structure: one short paragraph that answers directly, then 2 to 4 lines starting with '- ' giving "
        "concrete next steps (what to write down, which office or form the section points to, and that the "
        "official text of each cited Act is linked under the answer). Use **bold** for the single most "
        "important fact. Under 180 words.\n"
        "6. You are not a lawyer. Do not promise outcomes.\n"
        "Return a JSON object with keys: answer (string), citations (array of source numbers you used), "
        f"category (one of {', '.join(CATEGORY_IDS)}), confidence (0 to 1, how fully the sources answer the "
        "question), uncertain (boolean), uncertainty_reason (string or null), title (English, max 60 characters, "
        "a short name for this situation)."
    )
    past = ""
    if history:
        past = "EARLIER IN THIS CHAT:\n" + "\n".join(f"Q: {q}\nA: {a[:400]}" for q, a in history[-3:]) + "\n\n"
    user = f"{_profile_line(ctx)}\n\n{past}SOURCES:\n{_context_block(chunks)}\n\nQUESTION: {question}"
    return system, user


_MARKER = re.compile(r"\[(\d{1,2})\]")


def _first_sentences(text: str, n: int = 2) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    return " ".join(parts[:n])


def _offline_answer(question: str, chunks: list[Chunk]) -> dict[str, Any]:
    """Deterministic extractive answer used only when no LLM key is configured (dev)."""
    usable = [c for c in chunks if c.score >= 0.3][:3] or chunks[:2]
    lines = ["Here is what the matching sections say:"]
    for c in usable:
        lines.append(
            f"- **{c.act.full_name}, Section {c.section.section}** ({c.section.title}): "
            f"{_first_sentences(c.section.body)} [{c.n}]"
        )
    lines.append("- Keep copies of every document, receipt and message related to your situation.")
    lines.append("- For a free lawyer, contact your District Legal Services Authority (NALSA helpline 15100).")
    cats = [cat for c in usable for cat in c.section.categories]
    category = max(set(cats), key=cats.count) if cats else "other"
    return {
        "answer": "\n".join(lines),
        "citations": [c.n for c in usable],
        "category": category,
        "confidence": round(sum(c.score for c in usable) / len(usable), 2),
        "uncertain": False,
        "uncertainty_reason": None,
        "title": short_title(question),
    }


def short_title(text: str, limit: int = 60) -> str:
    """Trim at a word boundary so titles never end mid-word."""
    flat = " ".join(text.split()).rstrip("?.!")
    if len(flat) <= limit:
        return flat
    cut = flat[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",;:")


def _citation_numbers(raw: Any) -> list[int]:
    out: list[int] = []
    if not isinstance(raw, list):
        return out
    for item in raw:
        val: Any = item.get("source") if isinstance(item, dict) else item
        try:
            out.append(int(val))
        except (TypeError, ValueError):
            continue
    return out


def validate(parsed: dict[str, Any], chunks: list[Chunk]) -> tuple[str, list[CitationData], int]:
    """Keep only markers that point at a retrieved chunk whose section exists in the corpus.
    Returns the cleaned answer, the citations renumbered 1..n, and how many markers were claimed."""
    corpus = get_corpus()
    by_n = {c.n: c for c in chunks}
    answer = str(parsed.get("answer", "")).strip()
    claimed = set(_citation_numbers(parsed.get("citations"))) | {int(m) for m in _MARKER.findall(answer)}
    valid = [n for n in sorted(claimed)
             if n in by_n and corpus.get(by_n[n].act.id, normalise_section(by_n[n].section.section))]
    used_in_text = [int(m) for m in _MARKER.findall(answer) if int(m) in valid]
    order = list(dict.fromkeys(used_in_text + valid))
    renumber = {old: i + 1 for i, old in enumerate(order)}

    def _swap(m: re.Match[str]) -> str:
        n = int(m.group(1))
        return f"[{renumber[n]}]" if n in renumber else ""

    cleaned = re.sub(r"[ \t]+([.,;:])", r"\1", _MARKER.sub(_swap, answer))
    citations = [
        CitationData(
            index=renumber[n],
            act_id=by_n[n].act.id,
            act_name=by_n[n].act.full_name,
            section=by_n[n].section.section,
            section_title=by_n[n].section.title,
            excerpt=_first_sentences(by_n[n].section.body, 2),
            source_url=by_n[n].act.official_url,
        )
        for n in order
    ]
    return cleaned, citations, len(claimed)


def _strip_markers(text: str) -> str:
    cleaned = _MARKER.sub("", text)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r" +([.,;:])", r"\1", cleaned)
    return cleaned.strip()


def _as_steps(text: str) -> str:
    text = text.replace("\r\n", "\n")
    return re.sub(r"[ \t]+-\s+", "\n- ", text).strip()


def _fallback_advice() -> str:
    return (
        "The statutes loaded here do not include a section on this situation, "
        "so the steps below are general guidance.\n"
        "- Write down what happened, with dates and any papers you were given.\n"
        "- Ask the District Legal Services Authority for a free lawyer. The national helpline is 15100.\n"
        "- Do not sign a paper you do not understand."
    )


def _with_india_code(text: str) -> str:
    if "indiacode.nic.in" in text:
        return text
    return text.rstrip() + f"\n- Read the official text on India Code: {INDIA_CODE_URL}"


async def _advice_without_statute(result: RagResult, question: str, language: str, ctx: ChatContext,
                                  started: float) -> RagResult:
    """Practical steps when no loaded section matches. Never cites an unrelated Act."""
    s = get_settings()
    lang = LANGUAGE_INSTRUCTIONS.get(language, LANGUAGE_INSTRUCTIONS["english"])
    system = (
        "You are NYAY-SUTRA, a legal rights awareness assistant for citizens of India, focused on Maharashtra. "
        "The statute sections loaded on this server do not match this question. Give practical next steps. Rules:\n"
        "1. Do not name an Act or a section number. Do not invent a law, a form number, or a URL.\n"
        "2. Start with one sentence that the loaded statutes do not cover this question.\n"
        "3. Then 3 to 5 lines starting with '- ' telling the person what to do next.\n"
        "4. Mention the District Legal Services Authority and helpline 15100 when a lawyer would help.\n"
        f"5. Write in {lang}. Under 160 words. You are not a lawyer. Do not promise outcomes.\n"
        "Return a JSON object with keys: answer (string), "
        f"category (one of {', '.join(CATEGORY_IDS)}), "
        "title (English, max 60 characters), confidence (0 to 1)."
    )
    user = f"{_profile_line(ctx)}\n\nQUESTION: {question}"
    trace = result.trace
    trace["prompt"] = {"system": system, "user": user}
    parsed: dict[str, Any]
    try:
        llm_result = await llm.generate(system, user)
        result.provider, result.model = llm_result.provider, llm_result.model
        trace["fallback_used"] = llm_result.fallback_used
        trace["raw_response"] = llm_result.text
        try:
            parsed = llm_result.json()
        except ValueError:
            parsed = {"answer": _fallback_advice()}
    except llm.LLMUnavailable as exc:
        if not s.offline_llm_enabled:
            raise
        trace["llm_error"] = str(exc)
        parsed = {"answer": _fallback_advice(), "category": "other", "title": short_title(question, 60)}
        result.provider, result.model = "offline", "extractive-v1"
    body = parsed.get("answer")
    text = _as_steps(_strip_markers(body) if isinstance(body, str) and body.strip() else _fallback_advice())
    cat = str(parsed.get("category", "other"))
    result.category = cat if cat in CATEGORY_IDS else "other"
    title = parsed.get("title")
    result.title = short_title(title.strip() if isinstance(title, str) and title.strip() else question, 80)
    model_conf = parsed.get("confidence")
    result.confidence = round(float(model_conf), 3) if isinstance(model_conf, int | float) else 0.0
    result.answered = True
    result.answer = _with_india_code(text)
    result.citations = []
    result.kind = None
    result.latency_ms = int((time.perf_counter() - started) * 1000)
    trace["decision"] = "advice_without_statute"
    log.info("rag_decision", decision=trace["decision"], top=round(result.top_score, 3), provider=result.provider,
             citations=0, ms=result.latency_ms)
    return result


async def answer(question: str, language: str, ctx: ChatContext,
                 history: list[tuple[str, str]] | None = None) -> RagResult:
    s = get_settings()
    started = time.perf_counter()
    chunks, reranker_name = await retrieve(question, ctx)
    top = chunks[0].score if chunks else 0.0
    preview = [c.preview() for c in chunks[:3]]
    trace: dict[str, Any] = {
        "question": question,
        "language": language,
        "context": {"state": ctx.state, "city": ctx.city, "age": ctx.age},
        "reranker": reranker_name,
        "embedder": get_embedder().describe(),
        "retrieved": [{"key": c.section.key, "cosine": round(c.cosine, 4), "score": round(c.score, 3)}
                      for c in chunks],
        "threshold": s.retrieval_threshold,
    }
    result = RagResult(answered=False, top_score=top, preview=preview, trace=trace)

    if top < RELATED_FLOOR:
        return await _advice_without_statute(result, question, language, ctx, started)

    context = chunks[: s.context_chunks]
    system, user = build_prompt(question, context, ctx, language, history or [])
    trace["prompt"] = {"system": system, "user": user}
    try:
        llm_result = await llm.generate(system, user)
        raw = llm_result.text
        provider, model = llm_result.provider, llm_result.model
        trace["fallback_used"] = llm_result.fallback_used
        try:
            parsed = llm_result.json()
        except ValueError:
            parsed = {"answer": "", "uncertain": True, "uncertainty_reason": "Model output could not be parsed"}
    except llm.LLMUnavailable as exc:
        if not s.offline_llm_enabled:
            raise
        trace["llm_error"] = str(exc)
        parsed = _offline_answer(question, context)
        raw = None
        provider, model = "offline", "extractive-v1"
    trace["raw_response"] = raw
    result.provider, result.model = provider, model

    cleaned, citations, claimed = validate(parsed, context)
    model_conf = parsed.get("confidence")
    model_conf_f = float(model_conf) if isinstance(model_conf, int | float) else 0.5
    uncertain = bool(parsed.get("uncertain"))
    reason = parsed.get("uncertainty_reason")
    citation_ratio = (len(citations) / claimed) if claimed else 0.0
    confidence = round(0.45 * top + 0.25 * citation_ratio + 0.30 * max(0.0, min(1.0, model_conf_f)), 3)

    result.valid_citations = len(citations)
    result.confidence = confidence
    result.latency_ms = int((time.perf_counter() - started) * 1000)
    cat = str(parsed.get("category", "other"))
    result.category = cat if cat in CATEGORY_IDS else "other"
    trace["post_processing"] = {
        "claimed_citations": claimed,
        "valid_citations": len(citations),
        "model_confidence": model_conf_f,
        "uncertain": uncertain,
        "combined_confidence": confidence,
    }

    if uncertain or not cleaned:
        result.kind = "model_refused"
        result.model_flag = str(reason) if reason else "Model said the sources do not answer this question."
    elif len(citations) < s.min_valid_citations:
        result.kind = "citation_missing"
        result.model_flag = f"Only {len(citations)} citation(s) could be verified against the corpus."
    elif confidence < s.confidence_threshold:
        result.kind = "low_confidence"
        result.model_flag = f"Combined confidence {confidence:.2f} below {s.confidence_threshold}."
    else:
        result.answered = True
        result.answer = cleaned
        result.citations = citations
        title = str(parsed.get("title") or "").strip()
        result.title = short_title(title or question, 80)
    trace["decision"] = "answered" if result.answered else result.kind
    log.info("rag_decision", decision=trace["decision"], top=round(top, 3), provider=provider,
             citations=len(citations), ms=result.latency_ms)
    return result
