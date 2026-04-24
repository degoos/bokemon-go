// ─────────────────────────────────────────────────────────────
// HelpGuide — in-app spelgids, gefilterd op huidige fase
//
// Tabs: Kaart · Vangen · Stelen · Items · Training · Toernooi
// Niet alle tabs zijn zichtbaar in elke fase.
// ─────────────────────────────────────────────────────────────
import { useState } from 'react'
import { ITEM_DETAILS, INVENTORY_ITEM_KEYS } from '../lib/itemDetails'

// Welke tabs zijn in welke fase zichtbaar
const ALL_TABS = [
  { id: 'kaart',    emoji: '🗺️', label: 'Kaart',    phases: ['collecting', 'training', 'tournament'] },
  { id: 'vangen',   emoji: '🎯', label: 'Vangen',   phases: ['collecting'] },
  { id: 'stelen',   emoji: '⚔️', label: 'Stelen',   phases: ['collecting'] },
  { id: 'items',    emoji: '🎒', label: 'Items',     phases: ['collecting'] },
  { id: 'training', emoji: '🌿', label: 'Training', phases: ['training'] },
  { id: 'toernooi', emoji: '🏆', label: 'Toernooi', phases: ['tournament'] },
]

// Type-voordeel tabel data
const TYPE_TABLE = [
  { type: '🔥 Vuur',    strong: '🌿 Gras',  weak: '💧 Water' },
  { type: '💧 Water',   strong: '🔥 Vuur',   weak: '⚡ Elektro' },
  { type: '⚡ Elektro', strong: '💧 Water',  weak: '🌿 Gras' },
  { type: '🌿 Gras',    strong: '💧 Water',  weak: '🔥 Vuur' },
  { type: '👻 Geest',   strong: '—',         weak: '👻 Geest' },
  { type: '🐉 Draak',   strong: 'Alles',     weak: '🐉 Draak' },
]

// Gedeelde header-stijl per sectie
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 11,
      fontWeight: 800,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: '#facc15',
      marginBottom: 8,
      marginTop: 16,
      paddingBottom: 4,
      borderBottom: '1px solid rgba(250,204,21,0.2)',
    }}>
      {children}
    </div>
  )
}

function Tip({ emoji, children }) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'flex-start',
      marginBottom: 8,
      lineHeight: 1.5, fontSize: 13, color: 'rgba(220,230,255,0.9)',
    }}>
      <span style={{ flexShrink: 0, fontSize: 15 }}>{emoji}</span>
      <span>{children}</span>
    </div>
  )
}

// ── Tab-inhoud ────────────────────────────────────────────────

function KaartContent() {
  return (
    <>
      <SectionTitle>Kaart lezen</SectionTitle>
      <Tip emoji="🟡">De gele cirkel om jou heen is je vangstzône. Bokémon binnen de cirkel kun je aantikken.</Tip>
      <Tip emoji="🟦">Jouw teamgenoten zijn altijd zichtbaar als gekleurde stippen op de kaart.</Tip>
      <Tip emoji="🫥">Tegenstanders zijn onzichtbaar — tenzij je een Silph Scope gebruikt of een Bloedmaan actief is.</Tip>
      <Tip emoji="🎨">De gekleurde zones op de kaart zijn biome-gebieden. Elk Bokémon-type spawnt vaker in zijn eigen zone.</Tip>

      <SectionTitle>Locaties</SectionTitle>
      <Tip emoji="🏚️">HQ = verlaten Team Rocket HQ. Hier vind je mini-games die items opleveren.</Tip>
      <Tip emoji="🏪">Mobiele Shop = Team Rocket met drank en items. Verschijnt als een pinnetje op de kaart zodra ze actief zijn.</Tip>
      <Tip emoji="👑">Gouden pulserende banner = Legendarische fase. Er is iets speciaals gespawnd — gebruik het warmer/kouder systeem.</Tip>
    </>
  )
}

function VangenContent() {
  return (
    <>
      <SectionTitle>Vangst starten</SectionTitle>
      <Tip emoji="1️⃣">Loop naar een Bokémon-marker toe tot je binnen de gele ring staat.</Tip>
      <Tip emoji="2️⃣">Tik op de Bokémon-marker. Er vliegt een Pokébal — daarna start de vangst-flow.</Tip>
      <Tip emoji="⏳">Zit er een afteltimer op de marker? Dan wacht de app of het andere team ook aankomt. Na de timer start je solo.</Tip>

      <SectionTitle>Uitdagingen</SectionTitle>
      <Tip emoji="🧑‍🤝‍🧑">Zijn beide teams aanwezig vóór de timer? Dan volgt een team-vs-team uitdaging. Wie wint, vangt de Bokémon.</Tip>
      <Tip emoji="🧍">Is alleen jouw team aanwezig? Dan start een solo-uitdaging — geen concurrentie.</Tip>
      <Tip emoji="🏆">Elke Bokémon heeft een XP-waarde. Hoe hoger, hoe sterker in het toernooi.</Tip>

      <SectionTitle>Speciale spawns</SectionTitle>
      <Tip emoji="✨">Blinkend = Shiny Bokémon. Zeldzamer en heeft een bonus in het toernooi.</Tip>
      <Tip emoji="❓">Vraagteken = Mystery Bokémon. XP zichtbaar, naam pas onthuld na vangst.</Tip>
      <Tip emoji="👑">Kroon = Legendarische spawn. Extra sterk, vereist een speciale aanpak.</Tip>
    </>
  )
}

function StelenContent() {
  return (
    <>
      <SectionTitle>Stelen stap voor stap</SectionTitle>
      <Tip emoji="1️⃣">Gebruik een Silph Scope via je Rugzak. Het andere team is 6 minuten zichtbaar op de kaart.</Tip>
      <Tip emoji="2️⃣">Loop fysiek naar een tegenstander toe en tik iemand aan.</Tip>
      <Tip emoji="3️⃣">Tik op "Stelen" in de app. Er start een Rock Paper Scissors, best-of-3.</Tip>
      <Tip emoji="4️⃣">Win je? Kies één Bokémon uit de teampool van de tegenstander. Verlies je? Zij kiezen één van jullie Bokémon.</Tip>

      <SectionTitle>Verdedigen</SectionTitle>
      <Tip emoji="🛡️">Protect-item: zet een schild op één Bokémon. Die kan niet gestolen worden.</Tip>
      <Tip emoji="🪞">Mirror Coat: activeer en zet "ready". Als je daarna een RPS verliest als verdediger, wordt de uitslag omgedraaid.</Tip>

      <SectionTitle>Let op</SectionTitle>
      <Tip emoji="⚠️">Het andere team krijgt een melding als je een Silph Scope activeert: "Jullie zijn opgejaagd!"</Tip>
      <Tip emoji="🚫">Stelen is alleen mogelijk tijdens de verzamelfase — niet tijdens training of toernooi.</Tip>
    </>
  )
}

function ItemsContent() {
  const items = INVENTORY_ITEM_KEYS.map(k => ITEM_DETAILS[k]).filter(Boolean)
  return (
    <>
      <SectionTitle>Items verkrijgen</SectionTitle>
      <Tip emoji="🏚️">Team Rocket HQ: speel mini-games voor gegarandeerde loot (o.a. Moon Stones).</Tip>
      <Tip emoji="🏪">Mobiele Shop: wissel drank of mini-challenges in voor items bij Team Rocket.</Tip>
      <Tip emoji="🎲">Pickup: rolt 3 willekeurige items uit de loot-pot.</Tip>

      <SectionTitle>Alle items</SectionTitle>
      {items.map(item => (
        <div key={item.name} style={{
          marginBottom: 10,
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.04)',
          borderRadius: 8,
          borderLeft: '2px solid rgba(250,204,21,0.3)',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
            {item.emoji} {item.name}
            <span style={{
              marginLeft: 6, fontSize: 10, fontWeight: 600,
              color: 'rgba(200,220,200,0.6)', textTransform: 'uppercase',
            }}>
              {item.phase === 'both' ? 'Altijd' : item.phase === 'collecting' ? 'Verzamelfase' : item.phase === 'training' ? 'Training' : 'Toernooi'}
            </span>
          </div>
          <div style={{ fontSize: 12, color: 'rgba(200,210,240,0.8)', lineHeight: 1.5 }}>
            {item.short}
          </div>
          {item.when && (
            <div style={{ fontSize: 11, color: 'rgba(180,190,220,0.6)', marginTop: 3, lineHeight: 1.4 }}>
              👉 {item.when}
            </div>
          )}
        </div>
      ))}
    </>
  )
}

function TrainingContent() {
  return (
    <>
      <SectionTitle>Evolueren</SectionTitle>
      <Tip emoji="1️⃣">Ga naar het Training-scherm (🌿 onderaan). Je ziet welk bier aan elk Bokémon gekoppeld is.</Tip>
      <Tip emoji="2️⃣">Drink als team het gekoppelde bier. Tik dan op "Verzoek goedkeuring".</Tip>
      <Tip emoji="3️⃣">Team Rocket (admin) keurt het goed — en de Bokémon evolueert!</Tip>
      <Tip emoji="🌙">Liever geen bier? Gebruik een Moon Stone voor een gratis evolutiestap, geen goedkeuring nodig.</Tip>

      <SectionTitle>Strategie</SectionTitle>
      <Tip emoji="⚡">Hogere evolutie = hogere XP in het toernooi. Evolueer je sterkste Bokémon als eerste.</Tip>
      <Tip emoji="🍺">Je kunt ook tussen toernooirondes nog evolueren als er tijd is.</Tip>
      <Tip emoji="🐉">Draak-type klopt alles — maar verliest van een andere Draak. Kies je duels slim.</Tip>
    </>
  )
}

function ToernooiContent() {
  return (
    <>
      <SectionTitle>Structuur</SectionTitle>
      <Tip emoji="🎯">Elk team kiest geheim: welke speler speelt welk duel, met welke Bokémon.</Tip>
      <Tip emoji="🔓">Na beide teams bevestigd → alle keuzes tegelijk onthuld. Vier gyms, één voor één.</Tip>
      <Tip emoji="🏅">Elke gym heeft eigen regels (zie de gym-intro bij de start van het duel).</Tip>

      <SectionTitle>XP & type-voordeel</SectionTitle>
      <Tip emoji="📊">Hogere XP = betere startpositie in het mini-spel (bv. minder bekers bij beerpong).</Tip>
      <Tip emoji="⚡">Gunstig type-matchup geeft +25% XP bovenop je basiswaarde.</Tip>

      <div style={{
        marginTop: 12,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
          background: 'rgba(255,255,255,0.08)',
          fontSize: 10, fontWeight: 800, textTransform: 'uppercase',
          letterSpacing: 0.5, color: 'rgba(255,255,255,0.6)',
        }}>
          {['Type', 'Sterk tegen', 'Zwak tegen'].map(h => (
            <div key={h} style={{ padding: '6px 8px' }}>{h}</div>
          ))}
        </div>
        {TYPE_TABLE.map((row, i) => (
          <div key={row.type} style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
            background: i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent',
            fontSize: 12,
          }}>
            <div style={{ padding: '6px 8px', fontWeight: 700 }}>{row.type}</div>
            <div style={{ padding: '6px 8px', color: '#4ade80' }}>{row.strong}</div>
            <div style={{ padding: '6px 8px', color: '#f87171' }}>{row.weak}</div>
          </div>
        ))}
      </div>

      <SectionTitle>Gyms</SectionTitle>
      <Tip emoji="🏓">Cinnabar Gym — Beerpong (parallel, alle niveaus tegelijk)</Tip>
      <Tip emoji="🎯">Pewter Gym — Jeu de boules / bottlecaps (sequentieel)</Tip>
      <Tip emoji="🥤">Vermilion Gym — Flip Cup (sequentieel)</Tip>
      <Tip emoji="🐎">Saffron Gym — Paardenrace met kaarten (sequentieel)</Tip>
    </>
  )
}

const CONTENT_MAP = {
  kaart:    <KaartContent />,
  vangen:   <VangenContent />,
  stelen:   <StelenContent />,
  items:    <ItemsContent />,
  training: <TrainingContent />,
  toernooi: <ToernooiContent />,
}

// ── Hoofd-component ────────────────────────────────────────────

export default function HelpGuide({ phase = 'collecting', onClose }) {
  const visibleTabs = ALL_TABS.filter(t => t.phases.includes(phase))
  const [activeTab, setActiveTab] = useState(visibleTabs[0]?.id || 'kaart')

  // Als de actieve tab niet meer zichtbaar is (fase-wissel), reset
  const resolvedTab = visibleTabs.find(t => t.id === activeTab)
    ? activeTab
    : visibleTabs[0]?.id

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 600,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'flex-end',
    }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxHeight: '85vh',
          background: '#0d1117',
          borderRadius: '20px 20px 0 0',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.1)',
          borderBottom: 'none',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 16px 0',
          flexShrink: 0,
        }}>
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            📖 Spelgids
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: 'none', borderRadius: 99,
              color: 'white', fontSize: 18,
              width: 32, height: 32,
              cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
            }}
          >✕</button>
        </div>

        {/* Tab-balk */}
        <div style={{
          display: 'flex',
          gap: 4,
          padding: '12px 12px 0',
          overflowX: 'auto',
          flexShrink: 0,
          scrollbarWidth: 'none',
        }}>
          {visibleTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px',
                borderRadius: 20,
                border: 'none',
                background: resolvedTab === tab.id
                  ? '#facc15'
                  : 'rgba(255,255,255,0.08)',
                color: resolvedTab === tab.id ? '#000' : 'rgba(255,255,255,0.7)',
                fontWeight: resolvedTab === tab.id ? 800 : 600,
                fontSize: 13,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Inhoud */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 16px 32px',
          // Extra padding onderin voor safe area
          paddingBottom: 'max(32px, env(safe-area-inset-bottom, 32px))',
        }}>
          {CONTENT_MAP[resolvedTab] || null}
        </div>
      </div>
    </div>
  )
}
