-- ============================================================
-- BOKÉMON GO — Handicap-systeem
-- Voegt handicap_definitions toe (configureerbaar via admin,
-- zoals opdrachten) + seed van 9 Pokémon-thema handicaps.
-- Gebruikt bestaande active_effects met item_key='handicap'
-- voor het tracken van actieve handicaps per team.
-- VEILIG IDEMPOTENT.
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. handicap_definitions tabel
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS handicap_definitions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key              TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  emoji            TEXT NOT NULL,
  description      TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 180,
  is_enabled       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order       INTEGER DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE handicap_definitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read/write" ON handicap_definitions;
CREATE POLICY "Public read/write" ON handicap_definitions
  FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- 2. Seed 9 handicaps (Pokémon-franchise thema)
-- ─────────────────────────────────────────────────────────────
INSERT INTO handicap_definitions (key, name, emoji, description, duration_seconds, sort_order) VALUES
  ('snorlax_block',    'Snorlax blokkeert de weg', '😴',
     'Hele team moet volledig stilstaan vóór ze verder mogen lopen.',
     45, 10),
  ('jigglypuff_sleep', 'Jigglypuffs slaaplied',     '💤',
     'Team moet op de grond gaan liggen en doen alsof ze slapen.',
     60, 20),
  ('metapod_harden',   'Metapod — Harden!',         '🐛',
     'Team moet als groepje compact samenstaan, niet uit elkaar.',
     120, 30),
  ('magnemite_cluster','Magnemite-cluster',         '🧲',
     'Team mag nooit meer dan ±5m uit elkaar zijn.',
     300, 40),
  ('krabby_walk',      'Krabby-walk',               '🦀',
     'Alleen zijwaarts lopen.',
     180, 50),
  ('politoed_hop',     'Politoed-hop',              '🐸',
     'Alleen hoppen, niet wandelen.',
     120, 60),
  ('slowbro_mode',     'Slowbro-modus',             '🐌',
     'Alleen in slow-motion bewegen.',
     180, 70),
  ('jigglypuff_mic',   'Jigglypuffs micro',         '🎵',
     'Alleen zingen, niet praten.',
     180, 80),
  ('psyduck_headache', 'Psyduck-hoofdpijn',         '🦆',
     'Iedereen handen op het hoofd.',
     180, 90)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description,
  duration_seconds = EXCLUDED.duration_seconds,
  sort_order = EXCLUDED.sort_order;

-- ─────────────────────────────────────────────────────────────
-- 3. Realtime publicatie
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'handicap_definitions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE handicap_definitions';
  END IF;
END
$$;

COMMIT;

-- ============================================================
-- KLAAR
-- active_effects krijgt rijen met item_key='handicap' wanneer
-- admin een handicap uitdeelt. Payload JSONB bevat:
--   { handicap_key, name, emoji, description, duration_seconds }
-- Client tickt client-side naar expires_at.
-- ============================================================
