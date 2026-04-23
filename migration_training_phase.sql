-- Migration: voeg 'training' toe aan CHECK constraints + realtime voor alle gamplay-tabellen
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
-- 2. Realtime publicatie voor alle gameplay-tabellen
--    (was enkel game_sessions — hierdoor kwamen updates niet live
--     binnen in useGameSession voor catches, spawns, etc.)
-- ══════════════════════════════════════════════════════════════════
ALTER PUBLICATION supabase_realtime ADD TABLE catches;
ALTER PUBLICATION supabase_realtime ADD TABLE active_spawns;
ALTER PUBLICATION supabase_realtime ADD TABLE players;
ALTER PUBLICATION supabase_realtime ADD TABLE teams;
ALTER PUBLICATION supabase_realtime ADD TABLE team_inventory;
ALTER PUBLICATION supabase_realtime ADD TABLE active_effects;
ALTER PUBLICATION supabase_realtime ADD TABLE events_log;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE evolution_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE evolution_log;
