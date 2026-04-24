-- ══════════════════════════════════════════════════════════════════
-- Migration: Legendarische Eindfase
-- Voegt legendary_phase_started_at toe aan game_sessions
-- Idempotent: veilig om meerdere keren te runnen
-- !! RUNNEN IN SUPABASE SQL EDITOR !!
-- ══════════════════════════════════════════════════════════════════

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS legendary_phase_started_at TIMESTAMPTZ;
