-- ============================================================
-- Migration: evolution_requests
-- Trainers kunnen een evolutieverzoek insturen dat Team Rocket
-- moet goedkeuren nadat zij het bijhorende bier gedronken hebben.
-- Enkel mogelijk tijdens de trainingsfase.
-- ============================================================

CREATE TABLE IF NOT EXISTS evolution_requests (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_session_id  UUID        NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  catch_id         UUID        NOT NULL REFERENCES catches(id) ON DELETE CASCADE,
  team_id          UUID        NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  -- Welke evolutiestap
  from_stage       INTEGER     NOT NULL,
  to_stage         INTEGER     NOT NULL,
  -- Moon stone gebruikt → automatische goedkeuring (geen bier nodig)
  used_moon_stone  BOOLEAN     NOT NULL DEFAULT FALSE,
  -- pending | approved | rejected
  -- (moon stone verzoeken worden direct op 'approved' gezet)
  status           TEXT        NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending', 'approved', 'rejected')),
  -- Tijdstempels
  requested_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at      TIMESTAMPTZ,
  -- Optionele Team Rocket-notitie bij weigering
  admin_note       TEXT
);

-- RLS
ALTER TABLE evolution_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read/write" ON evolution_requests
  FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE evolution_requests;
