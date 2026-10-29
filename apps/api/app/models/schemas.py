"""API schemas. Mirrors packages/shared/index.ts. Every model forbids unknown fields."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Language = Literal["english", "hinglish", "marathi", "hindi"]
Gender = Literal["female", "male", "nonbinary", "undisclosed", "other"]
Category = Literal[
    "tenancy",
    "consumer",
    "women_child",
    "rti",
    "health",
    "wages",
    "education",
    "criminal",
    "family",
    "cyber",
    "other",
]
DraftStatus = Literal["draft", "ready", "sent"]
DraftTemplate = Literal["rti", "consumer", "tenancy", "generic"]
ImproveAction = Literal["regenerate", "make_formal", "make_simpler", "add_citations", "custom"]
ModelProvider = Literal["groq", "gemini", "offline"]

CATEGORIES: tuple[str, ...] = Category.__args__  # type: ignore[attr-defined]

_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_TAGS = re.compile(r"<[^>]{0,200}>")

PHONE_RE = r"^\+91[6-9][0-9]{9}$"


def clean_text(value: str) -> str:
    return _TAGS.sub("", _CONTROL.sub("", value)).strip()


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


# Auth -------------------------------------------------------------------------------------------


class RequestOtp(Strict):
    phone: Annotated[str, Field(pattern=PHONE_RE)]


class RequestOtpResponse(Strict):
    sent: bool
    expires_in: int
    resend_after: int
    dev_code: str | None = None


class VerifyOtp(Strict):
    phone: Annotated[str, Field(pattern=PHONE_RE)]
    code: Annotated[str, Field(pattern=r"^[0-9]{6}$")]
    mode: Literal["signin", "signup"] = "signin"


class ConfirmCode(Strict):
    code: Annotated[str, Field(pattern=r"^[0-9]{6}$")]


# Users ------------------------------------------------------------------------------------------


class NotificationPrefs(Strict):
    legal_updates: bool
    email_digest: bool
    sms_reminders: bool
    state_schemes: bool
    weekly_digest: bool
    chat_reminders: bool
    quiet_hours_start: int | None
    quiet_hours_end: int | None


class NotificationUpdate(Strict):
    legal_updates: bool | None = None
    email_digest: bool | None = None
    sms_reminders: bool | None = None
    state_schemes: bool | None = None
    weekly_digest: bool | None = None
    chat_reminders: bool | None = None
    quiet_hours_start: Annotated[int, Field(ge=0, le=23)] | None = None
    quiet_hours_end: Annotated[int, Field(ge=0, le=23)] | None = None


class PrivacyPrefs(Strict):
    anonymous_by_default: bool
    save_chat_history: bool
    help_improve: bool
    use_profile_personalisation: bool
    retention_days: int


class PrivacyUpdate(Strict):
    anonymous_by_default: bool | None = None
    save_chat_history: bool | None = None
    help_improve: bool | None = None
    use_profile_personalisation: bool | None = None
    retention_days: Annotated[int, Field(ge=0, le=365)] | None = None

    @field_validator("retention_days")
    @classmethod
    def _retention(cls, v: int | None) -> int | None:
        if v is not None and 0 < v < 7:
            raise ValueError("retention_days must be 0 (never delete) or between 7 and 365")
        return v


class UserProfile(Strict):
    id: str
    phone: str
    email: str | None
    name: str | None
    age: int | None
    gender: Gender | None
    state: str
    district: str | None
    area: str | None
    preferred_language: Language
    preferred_voice_language: Language
    voice_playback: bool
    onboarding_completed: bool
    aadhaar_last4: str | None
    created_at: datetime
    notifications: NotificationPrefs
    privacy: PrivacyPrefs


class ProfileUpdate(Strict):
    name: Annotated[str, Field(min_length=2, max_length=120)] | None = None
    age: Annotated[int, Field(ge=13, le=120)] | None = None
    gender: Gender | None = None
    state: Annotated[str, Field(min_length=2, max_length=60)] | None = None
    district: Annotated[str, Field(max_length=60)] | None = None
    area: Annotated[str, Field(max_length=120)] | None = None
    preferred_language: Language | None = None
    preferred_voice_language: Language | None = None
    voice_playback: bool | None = None
    onboarding_completed: bool | None = None

    @field_validator("name", "district", "area", "state")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_text(v) if v is not None else None


class VerifyOtpResponse(Strict):
    access_token: str
    expires_in: int
    is_new_user: bool
    user: UserProfile


class SessionInfo(Strict):
    id: str
    device: str
    created_at: datetime
    last_seen_at: datetime
    current: bool


class StorageUsage(Strict):
    chats: int
    messages: int
    drafts: int
    voice_recordings: int


# Chats + query ----------------------------------------------------------------------------------


class CitationOut(Strict):
    index: int
    act_id: str
    act_name: str
    section: str
    section_title: str
    excerpt: str
    source_url: str | None


class ChatMessageOut(Strict):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
    category: Category | None
    confidence: float | None
    model_provider: ModelProvider | None
    model_name: str | None
    latency_ms: int | None
    retrieval_top_score: float | None
    was_low_confidence: bool
    language: Language | None
    transcript_language: Language | None
    transcript_confidence: float | None
    citations: list[CitationOut]


class FrozenContext(Strict):
    state: str | None
    city: str | None
    age: int | None
    language: Language
    frozen_at: datetime


class ChatSummary(Strict):
    id: str
    title: str
    category: Category
    pinned: bool
    context: FrozenContext
    created_at: datetime
    last_activity_at: datetime
    snippet: str
    follow_ups: int
    sources: int
    draft_status: DraftStatus | None


class ChatDetail(ChatSummary):
    messages: list[ChatMessageOut]


class ChatUpdate(Strict):
    title: Annotated[str, Field(min_length=1, max_length=80)] | None = None
    pinned: bool | None = None

    @field_validator("title")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_text(v) if v is not None else None


class QueryRequest(Strict):
    question: Annotated[str, Field(min_length=5, max_length=500)]
    language: Language | None = None
    chat_id: str | None = None
    transcript_language: Language | None = None
    transcript_confidence: Annotated[float, Field(ge=0, le=1)] | None = None

    @field_validator("question")
    @classmethod
    def _clean(cls, v: str) -> str:
        cleaned = clean_text(v)
        if len(cleaned) < 5:
            raise ValueError("Question must be at least 5 characters.")
        return cleaned


class RetrievalPreviewItem(Strict):
    act_id: str
    act_name: str
    section: str
    title: str
    score: float
    source_url: str | None


DiagnosticKind = Literal["low_confidence", "model_refused", "citation_missing", "user_reported"]


class Diagnostic(Strict):
    trace_id: str
    kind: DiagnosticKind
    question: str
    retrieval_top_score: float
    threshold: float
    retrieval_preview: list[RetrievalPreviewItem]
    model_flag: str | None
    valid_citations: int
    model_provider: ModelProvider | None
    model_name: str | None
    latency_ms: int | None
    created_at: datetime


class QueryAnswered(Strict):
    status: Literal["answered"] = "answered"
    chat_id: str
    user_message: ChatMessageOut
    message: ChatMessageOut


class QueryLowConfidence(Strict):
    status: Literal["low_confidence"] = "low_confidence"
    chat_id: str
    message_id: str
    diagnostic: Diagnostic


class ReportResponse(Strict):
    reported: bool
    trace_id: str


# Drafts -----------------------------------------------------------------------------------------


class DraftOut(Strict):
    id: str
    title: str
    recipient: str | None
    subject: str | None
    body: str
    language: Language
    template: DraftTemplate | None
    category: Category
    status: DraftStatus
    source_chat_id: str | None
    source_chat_title: str | None
    citations: list[CitationOut]
    created_at: datetime
    updated_at: datetime
    sent_at: datetime | None


class DraftCreate(Strict):
    template: DraftTemplate | None = None
    from_chat_id: str | None = None
    title: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    language: Language | None = None


class DraftUpdate(Strict):
    title: Annotated[str, Field(min_length=1, max_length=120)] | None = None
    recipient: Annotated[str, Field(max_length=255)] | None = None
    subject: Annotated[str, Field(max_length=255)] | None = None
    body: Annotated[str, Field(min_length=1, max_length=50_000)] | None = None
    status: Literal["draft", "ready"] | None = None

    @field_validator("title", "recipient", "subject")
    @classmethod
    def _clean(cls, v: str | None) -> str | None:
        return clean_text(v) if v is not None else None

    @field_validator("body")
    @classmethod
    def _clean_body(cls, v: str | None) -> str | None:
        return _CONTROL.sub("", v) if v is not None else None


class DraftVersionOut(Strict):
    id: str
    source: str
    prompt: str | None
    model_provider: ModelProvider | None
    body: str
    created_at: datetime


class ImproveRequest(Strict):
    action: ImproveAction
    prompt: Annotated[str, Field(max_length=500)] | None = None


# Rights -----------------------------------------------------------------------------------------


class RightAct(Strict):
    act_id: str
    short_name: str
    full_name: str
    sections: int
    official_url: str | None


class RightCategory(Strict):
    id: Category
    title: str
    summary: str
    icon: str
    acts: list[RightAct]
    section_count: int
    sample_questions: list[str]


class RightSection(Strict):
    act_id: str
    act_name: str
    section: str
    title: str
    body: str
    source_url: str | None


class RightCategoryDetail(RightCategory):
    sections: list[RightSection]


# Voice + health ---------------------------------------------------------------------------------


class TranscribeResponse(Strict):
    text: str
    language: Language
    confidence: float
    provider: Literal["bhashini", "whisper"]
    duration_ms: int


class HealthResponse(Strict):
    status: Literal["ok", "degraded"]
    version: str
    environment: str
    checks: dict[str, str]
