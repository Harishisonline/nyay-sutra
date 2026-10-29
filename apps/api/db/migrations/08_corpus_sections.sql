-- 08_corpus_sections.sql (parent: corpus_acts)
CREATE TABLE IF NOT EXISTS corpus_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    act_id VARCHAR(40) NOT NULL REFERENCES corpus_acts(id) ON DELETE CASCADE,
    section VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    language VARCHAR(20) NOT NULL DEFAULT 'english',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_corpus_sections_act_section UNIQUE (act_id, section)
);
