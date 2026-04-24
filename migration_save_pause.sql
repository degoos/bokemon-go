-- ═════════════════════════════════════════════════════════════════
-- Migration: Save & Pause — voortgang opslaan tussen fases
-- Idempotent: veilig om meerdere keren te runnen
-- !! RUNNEN IN SUPABASE SQL EDITOR !!
-- ═════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────
-- 1. Pauze-kolommen op game_sessions
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS is_paused BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ;

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS paused_at_status TEXT;

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS paused_message TEXT;
  -- Optionele boodschap die trainers zien tijdens pauze
  -- bv. "We zien jullie morgen om 20u opnieuw"

-- ─────────────────────────────────────────────────────────────────
-- 2. save_snapshots tabel
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS save_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Fase waarin de save is gemaakt (verzamel/training/tournament)
  status_at_save TEXT NOT NULL,
  -- Of dit een automatische save is (bij faseovergang/pauze)
  is_auto BOOLEAN NOT NULL DEFAULT FALSE,
  -- Volledige snapshot: teams, catches, inventory, effects, etc.
  snapshot JSONB NOT NULL,
  -- Korte samenvatting voor overzicht in admin
  summary JSONB DEFAULT '{}',
  -- bv. { "total_catches": 14, "team_counts": {...}, "items_total": 8 }
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_save_snapshots_session
  ON save_snapshots (game_session_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────────
-- 3. RLS + policy (publiek lezen/schrijven, zoals rest van schema)
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE save_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read/write" ON save_snapshots;
CREATE POLICY "Public read/write" ON save_snapshots
  FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────────
-- 4. Realtime publicatie — game_sessions heeft is_paused nodig
--    save_snapshots toevoegen zodat admin-UI live ziet wanneer save
--    gemaakt wordt vanuit een andere sessie
-- ─────────────────────────────────────────────────────────────────
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY['save_snapshots', 'game_sessions'];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
    END IF;
  END LOOP;
END $$;
