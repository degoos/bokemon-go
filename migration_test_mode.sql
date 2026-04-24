-- ============================================================
-- BOKÉMON GO — Test-modus migratie
-- Voegt één kolom toe aan game_sessions zodat admin een sessie
-- kan markeren als testsessie. Alleen in testsessies wordt de
-- 🧪 Test & Simulatie-tab in de admin getoond.
--
-- VEILIG IDEMPOTENT — kan meerdere keren uitgevoerd worden.
-- ============================================================

BEGIN;

ALTER TABLE game_sessions
  ADD COLUMN IF NOT EXISTS is_test_mode BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN game_sessions.is_test_mode IS
  'Wanneer TRUE verschijnt de 🧪 Test & Simulatie-tab in AdminScreen met seeders, reset-knoppen en item-editor. Nooit aanzetten tijdens een live spel.';

COMMIT;

-- ============================================================
-- KLAAR
-- Na deze migratie:
--   1. In admin → tab ⚙️ Setup → toggle "🧪 Test-modus" om aan te zetten
--   2. Nieuwe tab "🧪" verschijnt in de adminbalk met alle test-tools
-- ============================================================
