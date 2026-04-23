-- ============================================================
-- Bokémon GO — Toernooifase migration
-- ============================================================
-- Tabellen: tournament_state, tournament_matchups, tournament_results
-- Run in Supabase SQL Editor
-- ============================================================

-- -------------------------------------------------------
-- 1. tournament_state
--    Één rij per game_session. Houdt bij in welke gym
--    en in welke fase het toernooi zit.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_state (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id   UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  current_gym       INTEGER NOT NULL DEFAULT 0,     -- 0-3 (index in TOURNAMENT_GYMS)
  gym_phase         TEXT NOT NULL DEFAULT 'intro'
                    CHECK (gym_phase IN ('intro','draft','reveal','duels','complete','finished')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_session_id)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tournament_state_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tournament_state_updated_at ON tournament_state;
CREATE TRIGGER trg_tournament_state_updated_at
  BEFORE UPDATE ON tournament_state
  FOR EACH ROW EXECUTE FUNCTION update_tournament_state_updated_at();

-- -------------------------------------------------------
-- 2. tournament_matchups
--    Per duel-slot (gym + niveau 1/2/3) slaat elk team
--    op: welke trainer + welk gevangen Bokémon.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_matchups (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id   UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  gym_index         INTEGER NOT NULL,               -- 0-3
  level_index       INTEGER NOT NULL,               -- 0-2 (niveau 1/2/3)
  team_id           UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  player_id         UUID REFERENCES players(id) ON DELETE SET NULL,
  catch_id          UUID REFERENCES catches(id) ON DELETE SET NULL,
  confirmed         BOOLEAN NOT NULL DEFAULT FALSE, -- team heeft opstelling bevestigd
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_session_id, gym_index, level_index, team_id)
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_tournament_matchups_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_tournament_matchups_updated_at ON tournament_matchups;
CREATE TRIGGER trg_tournament_matchups_updated_at
  BEFORE UPDATE ON tournament_matchups
  FOR EACH ROW EXECUTE FUNCTION update_tournament_matchups_updated_at();

-- -------------------------------------------------------
-- 3. tournament_results
--    Eindresultaat per duel-slot (winnend team).
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS tournament_results (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id   UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  gym_index         INTEGER NOT NULL,
  level_index       INTEGER NOT NULL,
  winner_team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (game_session_id, gym_index, level_index)
);

-- -------------------------------------------------------
-- 4. RLS — zelfde patroon als rest van de app (anon read/write)
-- -------------------------------------------------------
ALTER TABLE tournament_state    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matchups ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_results  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_tournament_state"    ON tournament_state    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_tournament_matchups" ON tournament_matchups FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_tournament_results"  ON tournament_results  FOR ALL TO anon USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- 5. Realtime — publiceer wijzigingen voor live updates
-- -------------------------------------------------------
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_state;
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_matchups;
ALTER PUBLICATION supabase_realtime ADD TABLE tournament_results;
