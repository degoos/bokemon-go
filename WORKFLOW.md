# Parallel werken aan het toernooi tijdens een live spel

## TL;DR

- **main** = wat de spelers op dit moment gebruiken. Hier NIET aan toernooi sleutelen.
- **tournament-v2** = speeltuin voor het nieuwe toernooi. Alle v2-werk hier.
- Vercel maakt automatisch een **preview-URL** voor `tournament-v2` → jij test daar, spelers blijven op main.
- De `tournament_version`-kolom op `game_sessions` laat je per sessie kiezen welke versie rendert.
- Samen mergen doen we pas als de verzamelfase klaar is (of tijdens de pauze).

---

## Setup eenmalig (nu doen)

1. Run in Supabase SQL Editor: `migration_save_pause.sql` én `migration_tournament_version.sql`.
2. Check dat `tournament-v2`-branch bestaat op GitHub: https://github.com/degoos/bokemon-go/tree/tournament-v2
3. Wacht tot Vercel de preview heeft gebouwd. URL is te vinden via het Vercel-dashboard of in de PR op GitHub (https://github.com/degoos/bokemon-go/pull/new/tournament-v2). Typisch iets als `bokemon-go-git-tournament-v2-degoos.vercel.app`.

## Dagelijkse workflow tijdens het spel

### Terwijl spelers verzamelen → jij bouwt op v2

```bash
cd bokemon-app
git checkout tournament-v2
git pull   # pak de laatste v2-commits
# ... werken ...
git add -A
git commit -m "feat(tournament-v2): <wat>"
git push
```

Vercel deployt automatisch naar de v2 preview-URL. Spelers op de main-URL merken er niks van.

### Testen op v2 zonder de live sessie te verstoren

1. Open de v2 preview-URL (niet de main-URL).
2. Maak een **aparte test-sessie** aan via "👑 Nieuwe game aanmaken" met een andere game_code.
3. In de admin: zet `tournament_version = 2` handmatig in Supabase (of voeg een toggle toe in TestTools).
4. Gebruik de scenario-seeders in het 🧪-tab om snel 10 catches + items te hebben.
5. Test toernooi-flow.

> **Belangrijk:** de live sessie en de test-sessie delen dezelfde Supabase, maar omdat ze verschillende `game_session_id`s hebben, zien de spelers niets van wat jij op v2 doet. De migratie heeft `tournament_version` op default 1 gezet — bestaande en nieuwe live sessies blijven v1 zolang je niet expliciet v2 zet.

## Regels om merge-conflict te voorkomen

1. **Raak geen bestanden aan die buiten het toernooi vallen.** Geen edits aan `MapScreen.jsx`, `CatchFlow.jsx`, `useGameSession.js`, `constants.js` (behalve nieuwe keys toevoegen onderaan), `gameEngine.js` (behalve nieuwe exports onderaan). Zeker geen bestaande functies hernoemen.
2. **Nieuwe bestanden zijn vrij**: maak gerust `TournamentScreenV2.jsx`, `components/tournament/...`, `lib/tournamentEngine.js`, etc.
3. **Voor een v1/v2-switch**: zet de wrapper in `TournamentScreen.jsx`:
   ```jsx
   export default function TournamentScreen(props) {
     if (props.session?.tournament_version === 2) return <TournamentScreenV2 {...props} />
     return <TournamentScreenLegacy {...props} />
   }
   ```
   Rename de huidige inhoud naar `TournamentScreenLegacy` in hetzelfde bestand of in een apart bestand. Enkel bij merge doen, niet tijdens het spel.
4. **Database-migraties enkel additief**: `ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`. Geen `DROP`, geen `ALTER COLUMN`-type-wijzigingen. Geen CHECK-constraints aanscherpen.

## Mergen (na einde verzamelfase of tijdens pauze)

```bash
git checkout main
git pull
git merge tournament-v2
# conflict? dan zijn regels hierboven geschonden — los op
git push
```

Vercel deployt binnen ~1 min. **Zeg in WhatsApp**: "Even je app refreshen (3× op 'vernieuwen' tikken of browser herstarten) voor we toernooi starten." PWA-cache is hardnekkig op iOS.

## Hotfix op main nodig tijdens parallel werken

Als je een bug in de verzamelfase moet fixen terwijl je op v2 werkt:

```bash
# Staand op tournament-v2, stash indien nodig:
git stash
git checkout main
# ... fix ...
git commit -am "fix: ..."
git push
git checkout tournament-v2
git rebase main    # pak de hotfix mee
git stash pop      # indien gestasht
```

## Snel kolom aanzetten voor testen

```sql
-- In Supabase SQL Editor (enkel voor een test-sessie!):
UPDATE game_sessions
SET tournament_version = 2
WHERE game_code = 'JOUWTESTCODE';
```

Live sessie blijft altijd op v1 zolang jij dat zo houdt.
