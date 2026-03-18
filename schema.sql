-- Vox — Schéma base de données Neon V3.0
-- Exécuter via la console Neon SQL Editor

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Entrées audio analysées ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS entries (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  job_id        TEXT        UNIQUE,
  audio_url     TEXT,
  duration_secs INT,
  source        TEXT        NOT NULL DEFAULT 'upload',    -- upload | record | manual
  status        TEXT        NOT NULL DEFAULT 'processing', -- processing | done | error
  transcript    TEXT,
  category      TEXT        NOT NULL DEFAULT 'inbox',     -- work | personal | idea | meeting | inbox
  title         TEXT,
  summary       TEXT,
  tags          TEXT[]      NOT NULL DEFAULT '{}',
  email_draft   TEXT,
  error         TEXT,
  pinned        BOOLEAN     NOT NULL DEFAULT false,
  archived      BOOLEAN     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS entries_status_idx    ON entries(status);
CREATE INDEX IF NOT EXISTS entries_created_idx   ON entries(created_at DESC);
CREATE INDEX IF NOT EXISTS entries_category_idx  ON entries(category);
CREATE INDEX IF NOT EXISTS entries_archived_idx  ON entries(archived);
CREATE INDEX IF NOT EXISTS entries_tags_idx      ON entries USING GIN(tags);

-- ── Items extraits (tâche / idée / décision / rappel) ─────────────────────
CREATE TABLE IF NOT EXISTS items (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   UUID        NOT NULL REFERENCES entries(id) ON DELETE CASCADE,
  type       TEXT        NOT NULL DEFAULT 'task',  -- task | idea | decision | reminder
  text       TEXT        NOT NULL,
  done       BOOLEAN     NOT NULL DEFAULT false,
  due_date   TIMESTAMPTZ,
  position   INT         NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS items_entry_id_idx ON items(entry_id);
CREATE INDEX IF NOT EXISTS items_type_idx     ON items(type);
CREATE INDEX IF NOT EXISTS items_done_idx     ON items(done);

-- ── Configuration (tokens OAuth, paramètres) ──────────────────────────────
CREATE TABLE IF NOT EXISTS config (
  key        TEXT PRIMARY KEY,
  value      TEXT        NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Migration V2 → V3 (installations existantes avec tables calls/call_actions) ──
-- Idempotent : ON CONFLICT (id) DO NOTHING garantit la sécurité en cas de double exécution
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'calls'
  ) THEN
    INSERT INTO entries (
      id, created_at, job_id, audio_url, source, status, transcript,
      category, title, summary, tags, email_draft, error, pinned, archived
    )
    SELECT
      id,
      created_at,
      job_id,
      audio_url,
      'upload' AS source,
      status,
      transcript,
      CASE call_type
        WHEN 'client'      THEN 'work'
        WHEN 'fournisseur' THEN 'work'
        WHEN 'prospect'    THEN 'work'
        WHEN 'interne'     THEN 'work'
        ELSE 'inbox'
      END AS category,
      titre  AS title,
      resume AS summary,
      CASE
        WHEN project_name IS NOT NULL AND project_name NOT IN ('', 'Non précisé')
        THEN ARRAY[project_name]
        ELSE '{}'::TEXT[]
      END AS tags,
      email  AS email_draft,
      error,
      false  AS pinned,
      false  AS archived
    FROM calls
    ON CONFLICT (id) DO NOTHING;
  END IF;

  IF EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'call_actions'
  ) THEN
    INSERT INTO items (id, entry_id, type, text, done, position, created_at)
    SELECT id, call_id AS entry_id, 'task' AS type, text, done, position, created_at
    FROM call_actions
    ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── V3.1 : Espaces et Projets ─────────────────────────────────────────────
-- Exécuter dans Neon SQL Editor après V3.0

CREATE TABLE IF NOT EXISTS spaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '📁',
  color      TEXT NOT NULL DEFAULT '#7a7268',
  position   INT  NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS projects (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id    UUID REFERENCES spaces(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT NOT NULL DEFAULT '#c8410a',
  status      TEXT NOT NULL DEFAULT 'active', -- active | paused | done | archived
  position    INT  NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS projects_space_id_idx ON projects(space_id);
CREATE INDEX IF NOT EXISTS projects_status_idx   ON projects(status);

ALTER TABLE entries ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS entries_project_id_idx ON entries(project_id);

-- ── V3.2 : Événements calendrier Google ────────────────────────────────────
-- Exécuter dans Neon SQL Editor après V3.1

ALTER TABLE entries ADD COLUMN IF NOT EXISTS calendar_event        JSONB;
ALTER TABLE entries ADD COLUMN IF NOT EXISTS calendar_event_status TEXT;
-- calendar_event_status : NULL (non détecté) | 'suggested' | 'confirmed' | 'dismissed'

-- ── V3.3 : Rétrospectives hebdomadaires ─────────────────────────────────────
-- Exécuter dans Neon SQL Editor après V3.2

CREATE TABLE IF NOT EXISTS weekly_reviews (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start   DATE        NOT NULL,
  entry_count  INT         NOT NULL DEFAULT 0,
  data         JSONB       NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_reviews_week_start_idx ON weekly_reviews(week_start);
