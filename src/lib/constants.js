export const POKEMON_TYPES = {
  water:    { label: 'Water',   emoji: '💧', color: '#3b82f6', mapColor: '#60a5fa' },
  fire:     { label: 'Vuur',    emoji: '🔥', color: '#ef4444', mapColor: '#f87171' },
  electric: { label: 'Elektro', emoji: '⚡', color: '#eab308', mapColor: '#facc15' },
  grass:    { label: 'Gras',    emoji: '🌿', color: '#22c55e', mapColor: '#4ade80' },
  ghost:    { label: 'Geest',   emoji: '👻', color: '#a855f7', mapColor: '#c084fc' },
  dragon:   { label: 'Draak',   emoji: '🐉', color: '#f97316', mapColor: '#fb923c' },
}

export const TYPE_ADVANTAGES = {
  fire:     { strong: ['grass'],    weak: ['water'] },
  water:    { strong: ['fire'],     weak: ['electric'] },
  electric: { strong: ['water'],    weak: ['grass'] },
  grass:    { strong: ['water'],    weak: ['fire'] },
  ghost:    { strong: [],           weak: ['ghost'] },
  dragon:   { strong: ['water','fire','electric','grass','ghost'], weak: ['dragon'] },
}

export const SPAWN_TYPES = {
  normal:    { label: 'Normaal',   emoji: '' },
  shiny:     { label: 'Blinkend ✨', emoji: '✨' },
  mystery:   { label: 'Mystery',   emoji: '❓' },
  legendary: { label: 'Legendary', emoji: '👑' },
  special:   { label: 'Speciaal',  emoji: '⭐' },
}

export const GAME_PHASES = {
  setup:          'Setup',
  collecting:     'Verzamelfase',
  training:       'Trainingsfase',
  tournament:     'Toernooifase',
  finished:       'Afgelopen',
}

// Volgorde van de fases (voor UI-logica)
export const PHASE_ORDER = ['setup', 'collecting', 'training', 'tournament', 'finished']

export const DEFAULT_CENTER = [51.0858, 5.4514] // Oudsberg, Oudsbergen
export const DEFAULT_ZOOM = 16

export const CATCH_RADIUS_METERS = 50
export const ADMIN_KEY = 'rocket'

// ============================================================
// TOERNOOI — 4 gyms in vaste volgorde
// ============================================================
// XP-voordeel: Cat1 = 1–49 XP diff, Cat2 = 50–149, Cat3 = 150+
// XP-verschil berekend NA type-voordeel (+25% XP bij gunstig type)
// typeIsBonus = true → winnend type krijgt bonus (geen straf)
// typeIsBonus = false/undefined → verliezend type krijgt handicap
// ============================================================
export const TOURNAMENT_GYMS = [
  {
    id: 'cinnabar',
    naam: 'Cinnabar Gym',
    leider: 'Gym Leader Blaine',
    emoji: '🏓',
    drank: 'bier (bok)',
    parallel: true,             // alle niveaus tegelijk
    niveaus: [
      { label: 'Niveau 1', bekers: 4, bier: '1 bok (¼ bok/beker)' },
      { label: 'Niveau 2', bekers: 6, bier: '1½ bok (¼ bok/beker)' },
      { label: 'Niveau 3', bekers: 6, bier: '2 bokken (⅓ bok/beker)' },
    ],
    xpVoordeel: {
      cat1: 'Verwijder 1 beker van tegenstander vóór start',
      cat2: 'Verwijder 2 bekers van tegenstander vóór start',
      cat3: 'Verwijder 2 bekers + mag zelf 1 gerakte beker terugplaatsen',
    },
    typeHandicap: 'Verliezend type gooit 1 van de 2 worpen per beurt met niet-dominante hand (eigen keuze welke worp).',
    intro: [
      'So, a trainer dares to challenge the Cinnabar Gym!',
      "I'm Blaine! Cinnabar Gym Leader! My policy is never to run from a battle!",
      'Six cups stand before you. Two pintjes divided equally over all.',
      'You throw. The ball must land inside the cup. Your opponent drinks the cup and removes it.',
      'Empty all six cups of your opponent — and you win!',
      'Three levels of heat await. Level one: four cups. Level two: six cups. Level three: six cups with more beer.',
      'Your Bokémon fuels your advantage. A stronger Bokémon removes cups before the battle begins.',
      'The losing type fires with one hand tied behind its back.',
      'Three levels. All at once — no time to think! Play with fire and you\'re gonna get burned!',
    ],
  },
  {
    id: 'pewter',
    naam: 'Pewter Gym',
    leider: 'Gym Leader Brock',
    emoji: '🎯',
    drank: 'shotjes',
    parallel: false,
    niveaus: [
      { label: 'Niveau 1', afstand: '3 meter', rondes: 'Best of 3' },
      { label: 'Niveau 2', afstand: '5 meter', rondes: 'Best of 3' },
      { label: 'Niveau 3', afstand: '7 meter', rondes: 'Best of 3' },
    ],
    xpVoordeel: {
      cat1: '1 extra bal/dopje (4 vs 3)',
      cat2: '1 extra bal + gooit altijd als laatste in elke ronde',
      cat3: '2 extra ballen + gooit altijd als laatste',
    },
    typeHandicap: 'Verliezend type gooit 1 worp per ronde verplicht met niet-dominante hand (eigen keuze welke worp).',
    intro: [
      "So. You've made it to Pewter Gym. I'm Brock. Gym Leader here.",
      'My rock-hard willpower is evident even in how I throw.',
      'Jeu de boules. A simple game. Three balls. One target on the ground.',
      'Whoever lands closest to the target wins the round.',
      'Every ball of the winner closer than your best ball: one shot.',
      'Best of three rounds. No beer here. Shots.',
      'Three levels. The target moves further away: three meters, five meters, seven meters.',
      'A stronger Bokémon earns you extra balls or the final throw.',
      'The losing type throws one ball per round with the weak hand.',
      'No bouleset? Use an empty bottle as the target. Use bottle caps as balls. Same rules. Same seriousness.',
      "Sequential. One level at a time. I won't go easy on you just because you've come this far!",
    ],
  },
  {
    id: 'vermilion',
    naam: 'Vermilion Gym',
    leider: 'Gym Leader Lt. Surge',
    emoji: '🥤',
    drank: 'bier (bok)',
    parallel: false,
    niveaus: [
      { label: 'Niveau 1', bier: '¾ bok (¼ bok/beker)', bekers: 3 },
      { label: 'Niveau 2', bier: '1 bok (⅓ bok/beker)', bekers: 3 },
      { label: 'Niveau 3', bier: '1½ bok (½ bok/beker)', bekers: 3 },
    ],
    xpVoordeel: {
      cat1: 'Leeg 1 eigen beker in beker van tegenstander → 1 beker direct klaar om te flippen',
      cat2: 'Leeg 2 eigen bekers in bekers van tegenstander → 2 bekers direct klaar',
      cat3: 'Leeg alle 3 eigen bekers → jij begint meteen met flippen, tegenstander drinkt dubbel',
    },
    typeHandicap: 'Verliezend type flipt 1 beker naar keuze met niet-dominante hand.',
    intro: [
      "Hey, kid! Welcome to Vermilion Gym! I'm Lt. Surge! The Lightning American!",
      'I like to make all my battles short and intense!',
      'Three cups. One pintje divided equally over all three.',
      'Drink a cup completely empty. Then flip it on the table edge — rim down.',
      'First to flip all three: wins!',
      'Three levels. More beer per cup.',
      'Level one: three quarters pintje. Level two: one pintje. Level three: one and a half pintje.',
      'Stronger Bokémon? You get to pour your cups into your opponent\'s.',
      "Cat 1: pour one cup. Cat 2: pour two cups. Cat 3: pour all three — you start flipping right away.",
      "The losing type flips one cup with the weak hand.",
      "Sequential. One level at a time. Cheer each other on!",
      "Don't think you can beat the speed of lightning, kid!",
    ],
  },
  {
    id: 'saffron',
    naam: 'Saffron Gym',
    leider: 'Gym Leader Sabrina',
    emoji: '🐎',
    drank: 'shotjes',
    parallel: false,
    niveaus: [
      { label: 'Niveau 1', parcours: '6 stappen', hekken: '1 hek (positie 3)', rondes: 'Best of 3' },
      { label: 'Niveau 2', parcours: '8 stappen', hekken: '2 hekken (positie 3 en 6)', rondes: 'Best of 3' },
      { label: 'Niveau 3', parcours: '10 stappen', hekken: '3 hekken (positie 3, 5 en 8)', rondes: 'Best of 3' },
    ],
    xpVoordeel: {
      cat1: 'Mag als eerste zijn 2 paarden kiezen',
      cat2: 'Kiest als eerste + 1 paard start 1 stap vóór de startlijn',
      cat3: 'Kiest als eerste + 1 paard start 2 stappen vóór de startlijn',
    },
    typeHandicap: 'Winnend type kiest een getal van 1 tot 10 — telkens een kaart met dat getal wordt omgedraaid, zet 1 van zijn paarden 1 extra stap vooruit.',
    typeIsBonus: true,          // ← geen straf voor verliezer, bonus voor winnaar
    intro: [
      'I had a vision of your arrival, trainer.',
      'I am Sabrina. Leader of Saffron Gym. My Bokémon have formidable mental power.',
      'Four horses. Four symbols: ♠ ♥ ♦ ♣. You choose two. Your opponent chooses two.',
      'Cards are turned one by one. The horse matching the symbol takes one step forward.',
      'First horse to cross the finish: its owner wins that race. Best of three races.',
      'But fate sets obstacles. Fences appear on fixed positions along the track.',
      'When your horse passes a fence: you drink a shot. Even if you win.',
      'Three levels. Longer tracks. More fences.',
      'A stronger Bokémon chooses its horses first — and may start ahead.',
      'The type advantage grants a vision: choose a number from 1 to 10.',
      'Choose one of your horses to receive that vision. Every time a card with that number is drawn — that horse moves one extra step.',
      'Sequential. Race after race. I have foreseen your defeat.',
    ],
  },
]

// XP-categorieën drempelwaarden (configureerbaar)
export const XP_CATEGORIES = [
  { cat: 1, minDiff: 1,   maxDiff: 49,  label: 'Klein voordeel (Cat 1)' },
  { cat: 2, minDiff: 50,  maxDiff: 149, label: 'Matig voordeel (Cat 2)' },
  { cat: 3, minDiff: 150, maxDiff: Infinity, label: 'Groot voordeel (Cat 3)' },
]
