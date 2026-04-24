-- ============================================================
-- BOKÉMON GO — Items & Shops migratie
-- Hernoemt itempool naar nieuwe spec, splitst Moon Stone (evolutie)
-- van Silph Scope (visibility), voegt HQ-locatie + hq_progress toe,
-- voegt master_ball_reward toe aan opdracht_definitions.
--
-- VEILIG IDEMPOTENT: kan meerdere keren uitgevoerd worden.
-- DROPT BESTAANDE team_inventory + active_effects rijen omdat
-- deze pre-game testdata zijn (item-keys hernoemen anders breekt).
-- ============================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1. game_sessions: hq_location toevoegen + mobiele shop config
-- ─────────────────────────────────────────────────────────────
ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS hq_location JSONB,                       -- {lat, lng}
  ADD COLUMN IF NOT EXISTS mobile_shop_active BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mobile_shop_items JSONB DEFAULT '[]';    -- [{item_key, prijs_slokken, prijs_uitdaging}]

-- ─────────────────────────────────────────────────────────────
-- 2. item_definitions: clean break — oude rijen weg, nieuwe spec erin
-- ─────────────────────────────────────────────────────────────

-- Eerst FK losmaken zodat we item_keys kunnen wisselen
ALTER TABLE team_inventory DROP CONSTRAINT IF EXISTS team_inventory_item_key_fkey;

-- Pre-game testdata wegen
DELETE FROM active_effects;
DELETE FROM team_inventory;
DELETE FROM item_definitions;

-- Nieuwe items inserten conform spec (Items & Pokéshops doc)
INSERT INTO item_definitions (key, name, emoji, description, effect_type, usable_in_phase, is_enabled) VALUES
  ('moon_stone',
    'Moon Stone', '🌙',
    'Evolutie-item. Eén evolutiestap zonder bier — alternatief als de trainer niet wil drinken.',
    'free_evolution',
    ARRAY['collecting','training'],
    TRUE),
  ('silph_scope',
    'Silph Scope', '🔭',
    'Maakt tegenstanders zichtbaar op de kaart voor X minuten. Zij krijgen een waarschuwing.',
    'reveal_opponents',
    ARRAY['collecting'],
    TRUE),
  ('protect',
    'Protect', '🛡️',
    'Beschermt één Bokémon tegen steal in de verzamelfase.',
    'protect_pokemon',
    ARRAY['collecting'],
    TRUE),
  ('double_team',
    'Double Team', '🎭',
    'Plaatst een nep-GPS-locatie van één teamgenoot op de kaart van de tegenstander.',
    'fake_location',
    ARRAY['collecting'],
    TRUE),
  ('snatch',
    'Snatch', '🧲',
    'Steel een random Bokémon van de tegenstander zonder RPS-challenge.',
    'steal_random',
    ARRAY['collecting'],
    TRUE),
  ('mirror_coat',
    'Mirror Coat', '🪞',
    'Keer één verloren RPS-ronde om (eenmalig). Markeer vóór de RPS in je inventory.',
    'reverse_rps_round',
    ARRAY['collecting'],
    TRUE),
  ('pickup',
    'Pickup', '🎲',
    'Geeft 3 random items — kan zowel goede als slechte items bevatten.',
    'random_items',
    ARRAY['collecting'],
    TRUE),
  ('poke_lure',
    'Poké Lure', '🎣',
    'Teleporteert een zichtbare Pokémon-spawn naar jouw locatie.',
    'teleport_spawn',
    ARRAY['collecting'],
    TRUE),
  ('pokemon_egg',
    'Pokémon Egg', '🥚',
    'Kweek een Bokémon via item-combinatie (recept in Pokédex).',
    'hatch_egg',
    ARRAY['collecting','training'],
    TRUE),
  ('master_ball',
    'Master Ball', '🏆',
    'Vangt automatisch de eerstvolgende Pokémon ongeacht opdracht of concurrentie. Eén per spel.',
    'auto_catch',
    ARRAY['collecting'],
    TRUE);

-- FK terug, nu MET ON UPDATE/DELETE cascade voor toekomstige renames
ALTER TABLE team_inventory
  ADD CONSTRAINT team_inventory_item_key_fkey
  FOREIGN KEY (item_key) REFERENCES item_definitions(key)
  ON UPDATE CASCADE ON DELETE CASCADE;

-- ─────────────────────────────────────────────────────────────
-- 3. active_effects: extra velden voor nieuwe item-typen
-- ─────────────────────────────────────────────────────────────
ALTER TABLE active_effects
  ADD COLUMN IF NOT EXISTS target_team_id UUID REFERENCES teams(id),
  ADD COLUMN IF NOT EXISTS target_player_id UUID REFERENCES players(id),
  ADD COLUMN IF NOT EXISTS payload JSONB DEFAULT '{}';

-- Index voor snelle "is dit team momenteel zichtbaar?"-checks
CREATE INDEX IF NOT EXISTS idx_active_effects_team_active
  ON active_effects (game_session_id, team_id, is_active, expires_at);

-- ─────────────────────────────────────────────────────────────
-- 4. hq_progress: voortgang per team per kamer
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hq_progress (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_session_id UUID NOT NULL REFERENCES game_sessions(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  room_number INTEGER NOT NULL CHECK (room_number IN (1, 2, 3)),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  loot_granted JSONB DEFAULT '[]',  -- welke items het team kreeg
  UNIQUE (game_session_id, team_id, room_number)
);

ALTER TABLE hq_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read/write" ON hq_progress;
CREATE POLICY "Public read/write" ON hq_progress
  FOR ALL TO anon USING (TRUE) WITH CHECK (TRUE);

-- ─────────────────────────────────────────────────────────────
-- 5. opdracht_definitions: master_ball_reward + item_reward
-- ─────────────────────────────────────────────────────────────
ALTER TABLE opdracht_definitions
  ADD COLUMN IF NOT EXISTS master_ball_reward BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS item_reward_key TEXT;
-- item_reward_key: optionele 'reward' wanneer challenge voltooid is
-- (geen FK; kan ook 'random' bevatten voor pickup-stijl)

-- ─────────────────────────────────────────────────────────────
-- 6. Realtime publicatie: hq_progress + game_sessions opnieuw
--    (game_sessions zit er al in vanuit schema.sql)
-- ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  -- hq_progress toevoegen aan realtime
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'hq_progress'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE hq_progress';
  END IF;
END
$$;

-- ─────────────────────────────────────────────────────────────
-- 7. Helpers: cleanup van verlopen active_effects
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION cleanup_expired_effects()
RETURNS void AS $$
BEGIN
  UPDATE active_effects
     SET is_active = FALSE
   WHERE is_active = TRUE
     AND expires_at IS NOT NULL
     AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

COMMIT;

-- ============================================================
-- KLAAR
-- Volgende stappen na het runnen van deze migratie:
--   1. Frontend code rebuild (`npm run build`)
--   2. Test InventoryScreen — alle 10 items zichtbaar
--   3. Admin: stel HQ-locatie in via setup-tab
--   4. Test Silph Scope activatie → tegenstanders zichtbaar
-- ============================================================
