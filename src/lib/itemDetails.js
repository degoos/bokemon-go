// ─────────────────────────────────────────────────────────────
// ITEM_DETAILS — één bron voor alles wat in UI over items verschijnt
//
// - emoji/name      : fallback als item_definitions nog niet geladen is
// - phase           : collecting | training | tournament | both
// - short           : 1 zin, in item-kaart kopregel
// - what            : wat doet het item (in mensentaal)
// - when            : wanneer is het het meest nuttig / waar zet je het in
// - effect          : technische details (duur, beperkingen…)
// - note            : extra waarschuwingen (optioneel)
// - mode            : welke flow start er bij "Inzetten"
//     confirm | pick_own_catch | pick_enemy_catch | pick_teammate
//     toggle_ready | roll_items | confirm_lure | confirm_master | info_only
//
// Gebruik overal waar we over items renderen (speler-rugzak,
// admin-beheer, HQ-loot-reveal, shop-UI, pickup-results).
// ─────────────────────────────────────────────────────────────

export const ITEM_DETAILS = {
  moon_stone: {
    emoji: '🌙',
    name:  'Moon Stone',
    phase: 'training',
    short: 'Gratis evolutiestap zonder bier.',
    what:  'Laat een Bokémon één evolutiestap maken zonder dat het team het gekoppelde bier moet drinken.',
    when:  'Gebruik in het Evolutie-scherm tijdens de trainingsfase — klik op "⬆️ Evolueer" bij een Bokémon en kies de Moon Stone-optie.',
    effect: 'Admin-goedkeuring is níét nodig voor Moon Stone-evoluties; deze gaan automatisch door.',
    mode:   'info_only',
  },

  silph_scope: {
    emoji: '🔭',
    name:  'Silph Scope',
    phase: 'collecting',
    short: 'Zie de tegenstanders 6 min op de kaart.',
    what:  'Onthult de live GPS-positie van alle spelers uit het andere team op jullie kaart.',
    when:  'Vlak voor je gaat stelen: activeer → ren naar tegenstander → tik iemand aan voor een RPS-steal.',
    effect: 'Duurt 6 minuten. Het andere team krijgt de waarschuwing "⚠️ Jullie zijn opgejaagd!" dus het is geen verrassing.',
    mode:   'confirm',
  },

  protect: {
    emoji: '🛡️',
    name:  'Protect',
    phase: 'collecting',
    short: 'Bescherm één Bokémon tegen steal.',
    what:  'Zet een schild op één van jullie gevangen Bokémon. Die kan niet worden gestolen via RPS of Snatch.',
    when:  'Activeer op jullie sterkste of meest unieke Bokémon zodra jullie vermoeden dat de tegenstander komt stelen.',
    effect: 'Blijft actief tot het einde van de verzamelfase of tot een steal-poging op die Bokémon gefaald is.',
    mode:   'pick_own_catch',
  },

  double_team: {
    emoji: '🎭',
    name:  'Double Team',
    phase: 'collecting',
    short: 'Plaats een nep-locatie van een teamgenoot.',
    what:  'Op de kaart van het andere team verschijnt een nep-positie van de gekozen teamgenoot (binnen 100m van de echte locatie).',
    when:  'Gebruik dit om een steal-poging te misleiden: kies een teamgenoot die in de buurt is van jullie sterkste Bokémon-drager maar net niet bij elkaar loopt.',
    effect: 'Duurt 8 minuten. Vereist dat de gekozen teamgenoot online is met GPS. Werkt alleen als het andere team een Silph Scope actief heeft.',
    mode:   'pick_teammate',
  },

  snatch: {
    emoji: '🧲',
    name:  'Snatch',
    phase: 'collecting',
    short: 'Steel één Bokémon zonder RPS.',
    what:  'Kies direct één Bokémon uit de teampool van de tegenstander en neem die over — geen tik, geen RPS.',
    when:  'Ideaal als jullie te ver weg zitten om fysiek te stelen, of om een Protect te omzeilen op hun andere Bokémon.',
    effect: 'Eenmalig. Tegenstander krijgt een notificatie. Beschermde (Protect) Bokémon zijn niet zichtbaar in de selectie.',
    mode:   'pick_enemy_catch',
  },

  mirror_coat: {
    emoji: '🪞',
    name:  'Mirror Coat',
    phase: 'collecting',
    short: 'Draait een verloren RPS-steal automatisch om.',
    what:  'Wanneer jullie "ready" zetten en daarna een RPS verliezen als verdediger, wordt de uitslag omgedraaid — jullie winnen toch.',
    when:  'Zet actief vóórdat de tegenstander op jullie kan tikken. Werkt preventief: je moet al "ready" staan wanneer de RPS start.',
    effect: 'Wordt automatisch verbruikt bij de eerstvolgende verloren RPS. Als je nooit verliest, blijft hij ready tot je hem handmatig uitschakelt.',
    mode:   'toggle_ready',
  },

  pickup: {
    emoji: '🎲',
    name:  'Pickup',
    phase: 'collecting',
    short: 'Rolt 3 willekeurige items.',
    what:  'Bij activatie krijg je direct 3 random items uit de loot-pot (geen Master Ball).',
    when:  'Geen reden om te wachten — gewoon inzetten om de rugzak aan te vullen.',
    effect: 'Je kan dubbele items krijgen. Zeldzamere items (Moon Stone, Snatch) hebben lagere kans.',
    mode:   'roll_items',
  },

  poke_lure: {
    emoji: '🎣',
    name:  'Poké Lure',
    phase: 'collecting',
    short: 'Teleporteer een spawn naar jouw locatie.',
    what:  'Activeer en tik daarna op een Bokémon-spawn op de kaart. Die spawn verschijnt meteen op jouw GPS-positie.',
    when:  'Gebruik wanneer er een mooie spawn ver weg staat én het andere team dichterbij is. Pak hem vóór zij er zijn.',
    effect: 'Je hebt 3 minuten om een spawn aan te tikken. Na aantik wordt de Lure verbruikt en verschijnt de spawn bij jou.',
    mode:   'confirm_lure',
  },

  pokemon_egg: {
    emoji: '🥚',
    name:  'Bokémon Egg',
    phase: 'both',
    short: 'Broed een Bokémon uit via recepten.',
    what:  'Door bepaalde item-combinaties te verzamelen, ontgrendel je een recept waaruit een Bokémon wordt gebroed. De Bokémon gaat mee naar het toernooi.',
    when:  'Check de Pokédex onder "Ei-recepten" om te zien welke items er nog nodig zijn. Uitbroeden gebeurt in de verzamelfase.',
    effect: 'Een uitgebroede Bokémon is niet vatbaar voor steal (is geen standaard catch).',
    note:   'Mechanic nog in opbouw — recepten komen in latere versie.',
    mode:   'info_only',
  },

  master_ball: {
    emoji: '🏆',
    name:  'Master Ball',
    phase: 'collecting',
    short: 'Vangt automatisch de eerstvolgende Bokémon.',
    what:  'Activeer, en de eerstvolgende spawn waar je bij staat wordt gevangen zonder opdracht, zonder wachten op team 2.',
    when:  'Bewaar voor een Legendary of moeilijke spawn waarvan je weet dat het andere team sneller zou zijn.',
    effect: 'Eén per spel — alleen via een speciale challenge of HQ kamer 3 te krijgen.',
    mode:   'confirm_master',
  },

  handicap: {
    emoji: '🎭',
    name:  'Handicap',
    phase: 'both',
    short: 'Straf opgelegd door Team Rocket.',
    what:  'Een handicap is geen item dat je zelf kiest — Team Rocket (admin) legt deze op aan een team.',
    when:  'Verschijnt automatisch in actieve-effecten zodra admin er één activeert.',
    effect: 'Elke handicap heeft zijn eigen duur en regels (zie notificatie-melding).',
    mode:   'info_only',
  },
}

// Lijst met alle item-keys die spelers daadwerkelijk in hun rugzak kunnen hebben.
// (handicap staat in active_effects, niet in team_inventory.)
export const INVENTORY_ITEM_KEYS = [
  'silph_scope',
  'protect',
  'double_team',
  'snatch',
  'mirror_coat',
  'pickup',
  'poke_lure',
  'moon_stone',
  'pokemon_egg',
  'master_ball',
]
