-- 10_row_level_security.sql
-- The FastAPI service connects as the database owner and scopes every query by user_id itself.
-- Enabling RLS with no policies closes the Supabase auto-generated REST API (anon and
-- authenticated roles) so no table is reachable from a browser with the anon key.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE draft_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE corpus_acts ENABLE ROW LEVEL SECURITY;
ALTER TABLE corpus_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;
