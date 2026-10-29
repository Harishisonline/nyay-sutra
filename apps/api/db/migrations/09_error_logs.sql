-- 09_error_logs.sql (parents: users, chat_sessions, chat_messages)
CREATE TABLE IF NOT EXISTS error_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    chat_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
    kind VARCHAR(40) NOT NULL,             -- 'low_confidence'|'model_refused'|'citation_missing'|'user_reported'
    trace_id VARCHAR(40) NOT NULL,
    question TEXT,
    retrieval_top_score REAL,
    retrieval_preview JSONB,
    model_flag TEXT,
    valid_citations INT NOT NULL DEFAULT 0,
    trace JSONB,                           -- raw trace, nulled after 24h by the API housekeeping task
    model_provider VARCHAR(20),
    model_name VARCHAR(80),
    latency_ms INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_error_logs_user ON error_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_kind ON error_logs(kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_chat ON error_logs(chat_session_id, created_at DESC);
