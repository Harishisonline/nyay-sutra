-- 03_chat_messages.sql (parent: chat_sessions)
CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user','assistant','system')),
    content TEXT NOT NULL,
    language VARCHAR(20),
    -- assistant-only metadata
    category VARCHAR(40),
    confidence REAL,
    model_provider VARCHAR(20),
    model_name VARCHAR(80),
    latency_ms INT,
    retrieval_top_score REAL,
    was_low_confidence BOOLEAN NOT NULL DEFAULT FALSE,
    -- transcript (for voice inputs)
    transcript_language VARCHAR(20),
    transcript_confidence REAL,
    -- user feedback
    feedback VARCHAR(20) CHECK (feedback IS NULL OR feedback IN ('thumbs_up','thumbs_down')),
    feedback_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created ON chat_messages(chat_session_id, created_at);
