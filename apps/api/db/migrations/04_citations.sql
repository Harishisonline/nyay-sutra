-- 04_citations.sql (parent: chat_messages)
-- Each citation is a single statute reference used in one assistant message.
CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
    position INT NOT NULL DEFAULT 1,       -- the [n] marker used in the answer text
    act_id VARCHAR(40) NOT NULL,           -- e.g. 'mh-rent-control-1999'
    act_name VARCHAR(160) NOT NULL,
    section VARCHAR(40) NOT NULL,          -- e.g. '24'
    section_title VARCHAR(200),
    excerpt TEXT,
    source_url VARCHAR(500),
    language VARCHAR(20) NOT NULL DEFAULT 'english',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_citations_message ON citations(chat_message_id);
