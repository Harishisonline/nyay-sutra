-- 06_draft_versions.sql (parent: drafts), the AI Improve history
CREATE TABLE IF NOT EXISTS draft_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    draft_id UUID NOT NULL REFERENCES drafts(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    source VARCHAR(20) NOT NULL,  -- 'template'|'from_chat'|'user_edit'|'regenerate'|'make_formal'|'make_simpler'|'add_citations'|'custom'
    prompt TEXT,                  -- the custom prompt if source = 'custom'
    model_provider VARCHAR(20),
    model_name VARCHAR(80),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_draft_versions_draft ON draft_versions(draft_id, created_at);
