-- Migration: voeg 'training' toe aan CHECK constraints + realtime voor alle gameplay-tabellen
-- Idempotent: veilig om meerdere keren te runnen
-- !! RUNNEN IN SUPABASE SQL EDITOR !!

-- ══════════════════════════════════════════════════════════════════
-- 1. CHECK constraints uitbreiden met 'training'
-- ══════════════════════════════════════════════════════════════════
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_phase_check;

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_status_check
  CHECK (status IN ('setup', 'collecting', 'training', 'tournament', 'finished'));

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_phase_check
  CHECK (phase IN ('setup', 'collecting', 'training', 'tournament_prep', 'tournament', 'finished'));

-- ══════════════════════════════════════════════════════════════════
-- 2. Realtime publicatie — tabellen toevoegen als ze er nog niet in zitten
-- ══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'catches', 'active_spawns', 'players', 'teams', 'team_inventory',
    'active_effects', 'events_log', 'notifications',
    'evolution_requests', 'evolution_log'
  ];
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
