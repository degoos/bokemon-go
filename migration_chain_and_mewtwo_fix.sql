-- ══════════════════════════════════════════════════════════════════
-- Migration: evolution_chain basisvorm fix + Mewtwo naamfix
-- Idempotent: veilig om meerdere keren te runnen
-- !! RUNNEN IN SUPABASE SQL EDITOR !!
-- ══════════════════════════════════════════════════════════════════

-- 1. Mewtwo naamfix (Mewktwo → Mewtwo) — veilig als al gedaan
UPDATE pokemon_definitions
SET name = 'Mewtwo'
WHERE name = 'Mewktwo';

-- 2. Evolution chain basisvorm fix
--    Probleem: chains zoals ["Haunter","Gengar"] missen de basisvorm als index 0
--    Fix: prepend naam als eerste element nog niet de naam is
--    Werkt enkel op niet-lege chains zodat Pokémon zonder evolutie onaangeroerd blijven
UPDATE pokemon_definitions
SET evolution_chain = jsonb_build_array(name) || evolution_chain
WHERE
  jsonb_array_length(evolution_chain) > 0
  AND (evolution_chain ->> 0) IS DISTINCT FROM name;

-- Controleer resultaat:
SELECT name, evolution_chain
FROM pokemon_definitions
WHERE jsonb_array_length(evolution_chain) > 0
ORDER BY name;
