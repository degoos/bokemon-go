-- ═════════════════════════════════════════════════════════════════
-- Migration: tournament_version feature-flag
-- Laat admin per sessie kiezen welke toernooiversie rendert.
-- v1 = huidige TournamentScreen. v2 = in development op branch tournament-v2.
-- Idempotent. Runnen in Supabase SQL Editor.
-- ═════════════════════════════════════════════════════════════════

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS tournament_version INTEGER NOT NULL DEFAULT 1;

-- Simpele constraint: enkel versies die we ondersteunen
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_tournament_version_check;
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_tournament_version_check
  CHECK (tournament_version IN (1, 2));
