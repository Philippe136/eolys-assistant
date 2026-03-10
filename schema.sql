-- Eolys Assistant — Schéma base de données Neon
-- Exécuter une seule fois via la console Neon SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS calls (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_id            TEXT UNIQUE,
  call_type         TEXT,                        -- client | fournisseur | interne | prospect
  project_name      TEXT,
  audio_url         TEXT,
  status            TEXT NOT NULL DEFAULT 'processing', -- processing | done | error
  transcript        TEXT,
  titre             TEXT,
  resume            TEXT,
  actions           JSONB,
  email             TEXT,
  error             TEXT,
  trello_url        TEXT,
  outlook_draft_id  TEXT,
  outlook_draft_url TEXT
);

CREATE INDEX IF NOT EXISTS calls_status_idx    ON calls(status);
CREATE INDEX IF NOT EXISTS calls_created_idx   ON calls(created_at DESC);
CREATE INDEX IF NOT EXISTS calls_call_type_idx ON calls(call_type);

-- Table de configuration (tokens OAuth, paramètres)
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migrations pour tables existantes (idempotentes)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS trello_url        TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS outlook_draft_id  TEXT;
ALTER TABLE calls ADD COLUMN IF NOT EXISTS outlook_draft_url TEXT;

-- V2.0 : Actions cochables (une ligne par action extraite)
CREATE TABLE IF NOT EXISTS call_actions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id    UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  text       TEXT NOT NULL,
  done       BOOLEAN NOT NULL DEFAULT false,
  position   INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS call_actions_call_id_idx ON call_actions(call_id);
