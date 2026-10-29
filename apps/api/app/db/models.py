"""ORM mirror of db/migrations/*.sql. The SQL files are the contract for Supabase Postgres;
these models let the same code run on SQLite for local development and tests."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

JsonType = JSON().with_variant(JSONB(), "postgresql")


def utcnow() -> datetime:
    return datetime.now(UTC)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(15), unique=True, nullable=False)
    phone_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    email: Mapped[str | None] = mapped_column(String(255), unique=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    name: Mapped[str | None] = mapped_column(String(120))
    age: Mapped[int | None] = mapped_column(Integer)
    gender: Mapped[str | None] = mapped_column(String(20))
    state: Mapped[str] = mapped_column(String(60), default="Maharashtra", nullable=False)
    district: Mapped[str | None] = mapped_column(String(60))
    area: Mapped[str | None] = mapped_column(String(120))
    preferred_language: Mapped[str] = mapped_column(String(20), default="english", nullable=False)
    preferred_voice_language: Mapped[str] = mapped_column(String(20), default="english", nullable=False)
    voice_playback: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notif_legal_updates: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notif_email_digest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notif_sms_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    notif_state_schemes: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notif_weekly_digest: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notif_chat_reminders: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    quiet_hours_start: Mapped[int | None] = mapped_column(Integer, default=22)
    quiet_hours_end: Mapped[int | None] = mapped_column(Integer, default=7)
    anonymous_by_default: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    save_chat_history: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    help_improve: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    use_profile_personalisation: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    retention_days: Mapped[int] = mapped_column(Integer, default=90, nullable=False)
    aadhaar_last4: Mapped[str | None] = mapped_column(String(4))
    password_set_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("age IS NULL OR (age >= 13 AND age <= 120)", name="ck_users_age"),
        CheckConstraint(
            "gender IS NULL OR gender IN ('female','male','nonbinary','undisclosed','other')",
            name="ck_users_gender",
        ),
        CheckConstraint(
            "preferred_language IN ('english','hinglish','marathi','hindi')", name="ck_users_language"
        ),
        CheckConstraint("retention_days = 0 OR retention_days BETWEEN 7 AND 365", name="ck_users_retention"),
    )


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    device: Mapped[str] = mapped_column(String(120), nullable=False, default="Unknown device")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("idx_user_sessions_user", "user_id"),)


class OtpChallenge(Base):
    """Local dev OTP backend only. Supabase mode never writes here."""

    __tablename__ = "otp_challenges"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    phone: Mapped[str] = mapped_column(String(15), nullable=False)
    code_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (Index("idx_otp_phone_created", "phone", "created_at"),)


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    frozen_state: Mapped[str | None] = mapped_column(String(60))
    frozen_city: Mapped[str | None] = mapped_column(String(120))
    frozen_age: Mapped[int | None] = mapped_column(Integer)
    frozen_language: Mapped[str] = mapped_column(String(20), nullable=False)
    title: Mapped[str | None] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(40), default="other", nullable=False)
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_activity_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="session", order_by="ChatMessage.created_at", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("idx_chat_sessions_user_recent", "user_id", "last_activity_at"),)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    chat_session_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="CASCADE"), nullable=False
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str | None] = mapped_column(String(20))
    category: Mapped[str | None] = mapped_column(String(40))
    confidence: Mapped[float | None] = mapped_column(Float)
    model_provider: Mapped[str | None] = mapped_column(String(20))
    model_name: Mapped[str | None] = mapped_column(String(80))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    retrieval_top_score: Mapped[float | None] = mapped_column(Float)
    was_low_confidence: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    transcript_language: Mapped[str | None] = mapped_column(String(20))
    transcript_confidence: Mapped[float | None] = mapped_column(Float)
    feedback: Mapped[str | None] = mapped_column(String(20))
    feedback_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    session: Mapped[ChatSession] = relationship(back_populates="messages")
    citations: Mapped[list[Citation]] = relationship(
        back_populates="message", order_by="Citation.position", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint("role IN ('user','assistant','system')", name="ck_messages_role"),
        Index("idx_chat_messages_session_created", "chat_session_id", "created_at"),
    )


class Citation(Base):
    __tablename__ = "citations"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    chat_message_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="CASCADE"), nullable=False
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    act_id: Mapped[str] = mapped_column(String(40), nullable=False)
    act_name: Mapped[str] = mapped_column(String(160), nullable=False)
    section: Mapped[str] = mapped_column(String(40), nullable=False)
    section_title: Mapped[str | None] = mapped_column(String(200))
    excerpt: Mapped[str | None] = mapped_column(Text)
    source_url: Mapped[str | None] = mapped_column(String(500))
    language: Mapped[str] = mapped_column(String(20), default="english", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    message: Mapped[ChatMessage] = relationship(back_populates="citations")

    __table_args__ = (Index("idx_citations_message", "chat_message_id"),)


class Draft(Base):
    __tablename__ = "drafts"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_chat_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="SET NULL")
    )
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    recipient: Mapped[str | None] = mapped_column(String(255))
    subject: Mapped[str | None] = mapped_column(String(255))
    body: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(20), nullable=False)
    template: Mapped[str | None] = mapped_column(String(40))
    category: Mapped[str] = mapped_column(String(40), default="other", nullable=False)
    citations: Mapped[list[dict[str, Any]]] = mapped_column(JsonType, default=list, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint("status IN ('draft','ready','sent')", name="ck_drafts_status"),
        Index("idx_drafts_user_recent", "user_id", "updated_at"),
    )


class DraftVersion(Base):
    __tablename__ = "draft_versions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    draft_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    prompt: Mapped[str | None] = mapped_column(Text)
    model_provider: Mapped[str | None] = mapped_column(String(20))
    model_name: Mapped[str | None] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (Index("idx_draft_versions_draft", "draft_id", "created_at"),)


class CorpusAct(Base):
    __tablename__ = "corpus_acts"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    short_name: Mapped[str] = mapped_column(String(40), nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    jurisdiction: Mapped[str] = mapped_column(String(40), nullable=False)
    state: Mapped[str | None] = mapped_column(String(60))
    enacted_year: Mapped[int] = mapped_column(Integer, nullable=False)
    repealed_year: Mapped[int | None] = mapped_column(Integer)
    official_url: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class CorpusSection(Base):
    __tablename__ = "corpus_sections"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    act_id: Mapped[str] = mapped_column(ForeignKey("corpus_acts.id", ondelete="CASCADE"), nullable=False)
    section: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    language: Mapped[str] = mapped_column(String(20), default="english", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (UniqueConstraint("act_id", "section", name="uq_corpus_sections_act_section"),)


class ErrorLog(Base):
    __tablename__ = "error_logs"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    chat_session_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_sessions.id", ondelete="SET NULL")
    )
    chat_message_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("chat_messages.id", ondelete="SET NULL")
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    trace_id: Mapped[str] = mapped_column(String(40), nullable=False)
    question: Mapped[str | None] = mapped_column(Text)
    retrieval_top_score: Mapped[float | None] = mapped_column(Float)
    retrieval_preview: Mapped[list[dict[str, Any]] | None] = mapped_column(JsonType)
    model_flag: Mapped[str | None] = mapped_column(Text)
    valid_citations: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trace: Mapped[dict[str, Any] | None] = mapped_column(JsonType)
    model_provider: Mapped[str | None] = mapped_column(String(20))
    model_name: Mapped[str | None] = mapped_column(String(80))
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    __table_args__ = (
        Index("idx_error_logs_user", "user_id", "created_at"),
        Index("idx_error_logs_kind", "kind", "created_at"),
        Index("idx_error_logs_chat", "chat_session_id", "created_at"),
    )
