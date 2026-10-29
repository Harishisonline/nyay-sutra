-- 07_corpus_acts.sql, reference table of every Act in the corpus
CREATE TABLE IF NOT EXISTS corpus_acts (
    id VARCHAR(40) PRIMARY KEY,            -- 'mh-rent-control-1999'
    short_name VARCHAR(40) NOT NULL,
    full_name VARCHAR(200) NOT NULL,
    jurisdiction VARCHAR(40) NOT NULL CHECK (jurisdiction IN ('central','state')),
    state VARCHAR(60),                     -- 'Maharashtra' for state Acts
    enacted_year INT NOT NULL,
    repealed_year INT,
    official_url VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
