-- 01_users.sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(15) UNIQUE NOT NULL,
    phone_verified_at TIMESTAMPTZ,
    email VARCHAR(255) UNIQUE,
    email_verified_at TIMESTAMPTZ,
    -- profile
    name VARCHAR(120),
    age INT CHECK (age IS NULL OR (age >= 13 AND age <= 120)),
    gender VARCHAR(20) CHECK (gender IS NULL OR gender IN ('female','male','nonbinary','undisclosed','other')),
    state VARCHAR(60) NOT NULL DEFAULT 'Maharashtra',
    district VARCHAR(60),
    area VARCHAR(120),
    onboarding_completed BOOLEAN NOT NULL DEFAULT FALSE,
    -- preferences (chat sessions freeze their own snapshot)
    preferred_language VARCHAR(20) NOT NULL DEFAULT 'english'
        CHECK (preferred_language IN ('english','hinglish','marathi','hindi')),
    preferred_voice_language VARCHAR(20) NOT NULL DEFAULT 'english',
    voice_playback BOOLEAN NOT NULL DEFAULT TRUE,
    -- notifications
    notif_legal_updates BOOLEAN NOT NULL DEFAULT TRUE,
    notif_email_digest BOOLEAN NOT NULL DEFAULT FALSE,
    notif_sms_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    notif_state_schemes BOOLEAN NOT NULL DEFAULT FALSE,
    notif_weekly_digest BOOLEAN NOT NULL DEFAULT FALSE,
    notif_chat_reminders BOOLEAN NOT NULL DEFAULT TRUE,
    quiet_hours_start INT DEFAULT 22 CHECK (quiet_hours_start IS NULL OR quiet_hours_start BETWEEN 0 AND 23),
    quiet_hours_end INT DEFAULT 7 CHECK (quiet_hours_end IS NULL OR quiet_hours_end BETWEEN 0 AND 23),
    -- privacy
    anonymous_by_default BOOLEAN NOT NULL DEFAULT TRUE,
    save_chat_history BOOLEAN NOT NULL DEFAULT TRUE,
    help_improve BOOLEAN NOT NULL DEFAULT TRUE,
    use_profile_personalisation BOOLEAN NOT NULL DEFAULT TRUE,
    retention_days INT NOT NULL DEFAULT 90 CHECK (retention_days = 0 OR retention_days BETWEEN 7 AND 365),
    -- misc
    aadhaar_last4 VARCHAR(4),
    password_set_at TIMESTAMPTZ,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

-- Device sessions behind Settings > Account > Active sessions (parent: users)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device VARCHAR(120) NOT NULL DEFAULT 'Unknown device',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

-- Local dev OTP backend only. Supabase phone auth never writes here.
CREATE TABLE IF NOT EXISTS otp_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(15) NOT NULL,
    code_hash VARCHAR(128) NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone_created ON otp_challenges(phone, created_at);
