-- Eolys Assistant — Schéma base de données Neon
-- Exécuter une seule fois via la console Neon SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS calls (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_id       TEXT UNIQUE,
  call_type    TEXT,                        -- client | fournisseur | interne | prospect
  project_name TEXT,
  audio_url    TEXT,
  status       TEXT NOT NULL DEFAULT 'processing', -- processing | done | error
  transcript   TEXT,
  titre        TEXT,
  resume       TEXT,
  actions      JSONB,
  email        TEXT,
  error        TEXT
);

CREATE INDEX IF NOT EXISTS calls_status_idx    ON calls(status);
CREATE INDEX IF NOT EXISTS calls_created_idx   ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS calls_call_type_idx ON calls(call_type);
