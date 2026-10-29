-- 02_chat_sessions.sql (parent: users)
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- frozen context snapshot (immutable after creation)
    frozen_state VARCHAR(60),
    frozen_city VARCHAR(120),
    frozen_age INT,
    frozen_language VARCHAR(20) NOT NULL,
    -- meta
    title VARCHAR(120),
    category VARCHAR(40) NOT NULL DEFAULT 'other',
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_recent
    ON chat_sessions(user_id, last_activity_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_pinned
    ON chat_sessions(user_id, pinned) WHERE deleted_at IS NULL AND pinned = TRUE;

-- The frozen context is a snapshot. Reject any later change at the database level too.
CREATE OR REPLACE FUNCTION chat_sessions_freeze_context() RETURNS trigger AS $$
BEGIN
    IF NEW.frozen_state IS DISTINCT FROM OLD.frozen_state
       OR NEW.frozen_city IS DISTINCT FROM OLD.frozen_city
       OR NEW.frozen_age IS DISTINCT FROM OLD.frozen_age
       OR NEW.frozen_language IS DISTINCT FROM OLD.frozen_language THEN
        RAISE EXCEPTION 'chat_sessions frozen context is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
SET search_path = '';

DROP TRIGGER IF EXISTS trg_chat_sessions_freeze ON chat_sessions;
CREATE TRIGGER trg_chat_sessions_freeze BEFORE UPDATE ON chat_sessions
    FOR EACH ROW EXECUTE FUNCTION chat_sessions_freeze_context();
