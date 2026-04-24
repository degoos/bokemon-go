-- migration_finale.sql
-- Legendaire Finale tabellen: 3-way battle (Team Magma vs Team Aqua vs Team Rocket/Mewtwo)
-- Runnen in Supabase SQL Editor

-- ─────────────────────────────────────────────
-- finale_state: één rij per game session
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finale_state (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id     UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  phase               TEXT        NOT NULL DEFAULT 'intro'
                                  CHECK (phase IN (
                                    'intro',
                                    'pick',       -- 3-way pick fase
                                    'reveal',     -- onthulling aanvallen
                                    'result',     -- schade + drank
                                    'eliminated', -- iemand KO
                                    'final_pick', -- 1v1 pick fase
                                    'final_reveal',
                                    'final_result',
                                    'winner'
                                  )),
  round               INTEGER     NOT NULL DEFAULT 1,
  -- hp als JSONB: { [team_id]: hp_waarde, "rocket": hp_waarde }
  hp                  JSONB       NOT NULL DEFAULT '{}',
  max_hp              JSONB       NOT NULL DEFAULT '{}',
  pikachu_team_id     UUID        REFERENCES teams(id),
  eliminated_team_id  UUID        REFERENCES teams(id),
  -- winner_team_id: UUID of team, of 'rocket'
  winner_team_id      TEXT,
  round_result        JSONB       DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_session_id)
);

-- ─────────────────────────────────────────────
-- finale_picks: aanval-keuzes per ronde per deelnemer
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS finale_picks (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  game_session_id     UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  round               INTEGER     NOT NULL,
  -- picker_id: team UUID of 'rocket'
  picker_id           TEXT        NOT NULL,
  attack_type         TEXT        NOT NULL
                                  CHECK (attack_type IN (
                                    'gewoon',      -- 25 schade
                                    'speciaal',    -- 40 schade, aanvaller drinkt 1 slok
                                    'verdediging', -- halveer inkomende schade
                                    'bliksem',     -- 30 schade aan BEIDE (Pikachu/Raichu)
                                    'psykracht'    -- kaats sterkste aanval × 1.5 terug (Mewtwo)
                                  )),
  -- target_id: team UUID of 'rocket', NULL bij bliksem/psykracht (automatisch)
  target_id           TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_session_id, round, picker_id)
);

-- ─────────────────────────────────────────────
-- Auto-update updated_at trigger
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS finale_state_updated_at ON finale_state;
CREATE TRIGGER finale_state_updated_at
  BEFORE UPDATE ON finale_state
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─────────────────────────────────────────────
-- RLS: anon mag alles (zoals alle andere tabellen)
-- ─────────────────────────────────────────────
ALTER TABLE finale_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon all" ON finale_state;
CREATE POLICY "anon all" ON finale_state FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE finale_picks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon all" ON finale_picks;
CREATE POLICY "anon all" ON finale_picks FOR ALL TO anon USING (true) WITH CHECK (true);

-- ─────────────────────────────────────────────
-- Realtime
-- ─────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE finale_state;
ALTER PUBLICATION supabase_realtime ADD TABLE finale_picks;
