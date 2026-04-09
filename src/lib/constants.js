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
  shiny:     { label: 'Shiny ✨',  emoji: '✨' },
  mystery:   { label: 'Mystery',   emoji: '❓' },
  legendary: { label: 'Legendary', emoji: '👑' },
  special:   { label: 'Speciaal',  emoji: '⭐' },
}

export const GAME_PHASES = {
  setup:           'Setup',
  collecting:      'Verzamelfase',
  tournament_prep: 'Toernooi Voorbereiding',
  tournament:      'Toernooi',
  finished:        'Afgelopen',
}

export const DEFAULT_CENTER = [51.0858, 5.4514] // Oudsberg, Oudsbergen
export const DEFAULT_ZOOM = 16

export const CATCH_RADIUS_METERS = 80
export const ADMIN_KEY = 'rocket'
