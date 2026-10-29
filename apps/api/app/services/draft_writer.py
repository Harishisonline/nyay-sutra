"""Draft templates, drafts generated from a chat, and the AI Improve actions."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.config import get_settings
from app.core.errors import ProblemError
from app.services import llm

TEMPLATES: dict[str, dict[str, str]] = {
    "rti": {
        "title": "RTI application",
        "category": "rti",
        "recipient": "The Public Information Officer,\n[Name of the department / office],\n[Address]",
        "subject": "Application for information under Section 6(1) of the Right to Information Act, 2005",
        "body": (
            "Sir / Madam,\n\n"
            "I, [your full name], a citizen of India, request the following information under Section 6(1) "
            "of the Right to Information Act, 2005:\n\n"
            "1. [First piece of information you need, with the time period]\n"
            "2. [Second piece of information]\n\n"
            "I have paid the application fee of Rs 10 by [cash / postal order / online payment, with reference "
            "number]. If I belong to the below poverty line category, a copy of my BPL card is attached and no "
            "fee is payable under Section 7(5).\n\n"
            "Please provide the information within thirty days as required by Section 7(1). If the information "
            "is held by another public authority, please transfer this application under Section 6(3).\n\n"
            "Yours faithfully,"
        ),
    },
    "consumer": {
        "title": "Consumer complaint",
        "category": "consumer",
        "recipient": "The President,\nDistrict Consumer Disputes Redressal Commission,\n[District]",
        "subject": "Complaint under Section 35 of the Consumer Protection Act, 2019",
        "body": (
            "Respected Sir / Madam,\n\n"
            "I, [your full name], residing at [address], file this complaint against [name and address of the "
            "seller or service provider].\n\n"
            "Facts of the case:\n"
            "1. On [date] I purchased / availed [product or service] for Rs [amount]. Invoice number [number].\n"
            "2. [Describe the defect, deficiency in service under Section 2(11), or unfair trade practice under "
            "Section 2(47).]\n"
            "3. I raised the issue on [date] by [email / letter / call], but it has not been resolved.\n\n"
            "This complaint is filed within two years of the cause of action, as required by Section 69.\n\n"
            "Relief sought:\n"
            "1. Replacement or refund of Rs [amount].\n"
            "2. Compensation of Rs [amount] for harassment and mental agony.\n"
            "3. Litigation costs.\n\n"
            "Yours faithfully,"
        ),
    },
    "tenancy": {
        "title": "Notice to landlord",
        "category": "tenancy",
        "recipient": "[Landlord's name],\n[Address of the landlord]",
        "subject": "Notice regarding [restoration of water supply / refund of security deposit] for [flat address]",
        "body": (
            "Dear [Landlord's name],\n\n"
            "I am the tenant of [flat / premises address] under the agreement dated [date]. I am writing about "
            "the following issue:\n\n"
            "[Describe the issue clearly, with dates.]\n\n"
            "Under Section 29 of the Maharashtra Rent Control Act, 1999, a landlord must not cut off or withhold "
            "an essential supply or service enjoyed by the tenant without just and sufficient cause.\n\n"
            "I request you to [restore the supply / refund the deposit of Rs amount] within [7 / 15] days of "
            "receiving this notice. If you do not, I will be constrained to approach the appropriate court or "
            "authority, at your cost.\n\n"
            "Yours sincerely,"
        ),
    },
    "generic": {
        "title": "Untitled draft",
        "category": "other",
        "recipient": "",
        "subject": "",
        "body": "",
    },
}

ACTION_INSTRUCTIONS = {
    "regenerate": "Rewrite the letter from scratch so it is clear, complete and well organised. Keep every fact.",
    "make_formal": "Rewrite the letter in a formal legal register suitable for a government office or court. "
                   "Keep every fact and every section number.",
    "make_simpler": "Rewrite the letter in simple words a person with school-level reading can follow. "
                    "Short sentences. Keep every fact and every section number.",
    "add_citations": "Keep the letter as it is, and add references to the relevant sections from SOURCES where "
                     "they support a point. Only cite sections listed in SOURCES.",
}

LANGUAGE_NAMES = {"english": "English", "hinglish": "Hinglish (Latin script)", "marathi": "Marathi (Devanagari)",
                  "hindi": "Hindi (Devanagari)"}


@dataclass
class ImproveResult:
    body: str
    provider: str
    model: str


def _legal_statements(answer: str) -> str:
    """Only the cited sentences of an answer belong in a letter; the next-step advice is for the user."""
    lines = [ln.strip() for ln in answer.splitlines() if ln.strip()]
    cited = [ln[2:] if ln.startswith("- ") else ln for ln in lines if re.search(r"\[\d+\]", ln)]
    text = " ".join(cited or lines)
    return " ".join(re.sub(r"\s*\[\d+\]", "", text).replace("**", "").split())


def body_from_chat(question: str, answer: str, citations: list[dict[str, Any]]) -> str:
    refs = "\n".join(f"- {c['act_name']}, Section {c['section']}: {c['section_title']}" for c in citations)
    situation = " ".join(question.split()).rstrip(".?!")
    return (
        "Respected Sir / Madam,\n\n"
        f"I am writing regarding the following matter: {situation}.\n\n"
        f"{_legal_statements(answer)}\n\n"
        f"The provisions that apply are:\n{refs}\n\n"
        "I request you to take the necessary action within fifteen days of receiving this letter.\n\n"
        "Yours faithfully,"
    )


def _sources_block(citations: list[dict[str, Any]]) -> str:
    if not citations:
        return "(none)"
    return "\n".join(f"- {c['act_name']}, Section {c['section']}: {c['section_title']}. {c.get('excerpt', '')}"
                     for c in citations)


def _offline_add_citations(body: str, citations: list[dict[str, Any]]) -> str:
    missing = [c for c in citations if f"Section {c['section']}" not in body]
    if not missing:
        return body
    refs = "\n".join(f"- {c['act_name']}, Section {c['section']} ({c['section_title']})" for c in missing)
    return f"{body.rstrip()}\n\nRelevant provisions:\n{refs}\n"


async def improve(action: str, body: str, language: str, citations: list[dict[str, Any]], prompt: str | None,
                  regenerate_from: str | None) -> ImproveResult:
    instruction = prompt if action == "custom" else ACTION_INSTRUCTIONS[action]
    if action == "custom" and not (prompt and prompt.strip()):
        raise ProblemError(422, "Tell AI Improve what to change.", slug="validation")
    source_body = regenerate_from if action == "regenerate" and regenerate_from else body
    system = (
        "You edit legal letters and complaint drafts for citizens in India. "
        f"Write in {LANGUAGE_NAMES.get(language, 'English')}. Keep Act names and section numbers in English. "
        "Never invent a law, section, date, amount or fact. Keep placeholders in [square brackets] as they are. "
        "Return a JSON object with one key: body (the full revised letter as plain text, no markdown headings)."
    )
    user = f"INSTRUCTION: {instruction}\n\nSOURCES:\n{_sources_block(citations)}\n\nLETTER:\n{source_body}"
    try:
        res = await llm.generate(system, user, temperature=0.3, max_tokens=1400)
        new_body = str(res.json().get("body", "")).strip()
        if not new_body:
            raise ValueError("empty body")
        return ImproveResult(new_body[:50_000], res.provider, res.model)
    except (llm.LLMUnavailable, ValueError) as exc:
        if llm.configured_providers() or not get_settings().offline_llm_enabled:
            raise ProblemError(502, "Could not improve. Your draft is unchanged. Try again or edit manually.",
                               slug="improve-failed") from exc
    if action == "add_citations":
        return ImproveResult(_offline_add_citations(body, citations), "offline", "extractive-v1")
    if action == "regenerate" and regenerate_from:
        return ImproveResult(regenerate_from, "offline", "template-v1")
    raise ProblemError(
        503,
        "AI Improve needs an LLM key (Groq or Gemini) on this server. Your draft is unchanged.",
        slug="llm-not-configured",
    )


def render_download(title: str, recipient: str | None, subject: str | None, body: str, sender_name: str | None,
                    sender_phone: str | None, sender_place: str | None, language: str) -> str:
    """Print-ready HTML: letterhead, date, recipient block, subject, body, signature block."""
    today = datetime.now(UTC).strftime("%d %B %Y")
    esc = html.escape
    paragraphs = "".join(f"<p>{esc(p).replace(chr(10), '<br>')}</p>" for p in body.split("\n\n") if p.strip())
    lang_attr = {"marathi": "mr", "hindi": "hi"}.get(language, "en")
    return f"""<!doctype html>
<html lang="{lang_attr}"><head><meta charset="utf-8"><title>{esc(title)}</title>
<style>
  @page {{ size: A4; margin: 22mm 20mm; }}
  body {{ font-family: "Noto Serif", "Noto Serif Devanagari", Georgia, serif; color: #111; font-size: 12pt;
         line-height: 1.6; max-width: 170mm; margin: 0 auto; padding: 16px; }}
  .head {{ display: flex; justify-content: space-between; border-bottom: 2px solid #111; padding-bottom: 10px; }}
  .from strong {{ font-size: 13pt; }}
  .meta {{ text-align: right; font-size: 10.5pt; color: #333; }}
  .to {{ margin: 22px 0 14px; white-space: pre-line; }}
  .subject {{ font-weight: bold; margin: 14px 0 18px; }}
  .sign {{ margin-top: 48px; }}
  .sign .line {{ width: 60mm; border-top: 1px solid #111; margin-top: 44px; padding-top: 4px; }}
  .foot {{ margin-top: 40px; font-size: 9pt; color: #666; border-top: 1px solid #ccc; padding-top: 8px; }}
</style></head>
<body>
  <div class="head">
    <div class="from"><strong>{esc(sender_name or "[Your name]")}</strong><br>{esc(sender_place or "[Your address]")}
      <br>Mobile: {esc(sender_phone or "[Your mobile number]")}</div>
    <div class="meta">Date: {today}<br>Place: {esc(sender_place or "")}</div>
  </div>
  <div class="to">To,<br>{esc(recipient or "[Recipient]")}</div>
  <div class="subject">Subject: {esc(subject or title)}</div>
  {paragraphs}
  <div class="sign"><div class="line">Signature</div>{esc(sender_name or "[Your name]")}</div>
  <div class="foot">Prepared with NYAY-SUTRA. This document is not legal advice.</div>
</body></html>"""
