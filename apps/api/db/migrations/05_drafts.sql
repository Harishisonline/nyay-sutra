-- 05_drafts.sql (parent: users, optional chat_sessions)
CREATE TABLE IF NOT EXISTS drafts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
    -- content
    title VARCHAR(160) NOT NULL,
    recipient VARCHAR(255),
    subject VARCHAR(255),
    body TEXT NOT NULL,
    language VARCHAR(20) NOT NULL,
    template VARCHAR(40),                  -- 'rti'|'consumer'|'tenancy'|'generic'|NULL
    category VARCHAR(40) NOT NULL DEFAULT 'other',
    citations JSONB NOT NULL DEFAULT '[]'::jsonb,  -- statute references carried over from the source chat
    -- status
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','sent')),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_drafts_user_recent ON drafts(user_id, updated_at DESC) WHERE deleted_at IS NULL;
