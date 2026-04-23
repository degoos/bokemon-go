-- Migration: voeg 'training' toe aan status en phase CHECK constraints van game_sessions
-- Reden: 'training' fase werd geïntroduceerd voor het evolutiesysteem maar ontbrak in de originele CHECK constraints.
-- Dit veroorzaakte dat "Start Trainingsfase" stil faalde (constraint violation).

-- Stap 1: verwijder de bestaande CHECK constraints
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_status_check;
ALTER TABLE game_sessions DROP CONSTRAINT IF EXISTS game_sessions_phase_check;

-- Stap 2: voeg de uitgebreide CHECK constraints opnieuw toe
ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_status_check
  CHECK (status IN ('setup', 'collecting', 'training', 'tournament', 'finished'));

ALTER TABLE game_sessions
  ADD CONSTRAINT game_sessions_phase_check
  CHECK (phase IN ('setup', 'collecting', 'training', 'tournament_prep', 'tournament', 'finished'));
