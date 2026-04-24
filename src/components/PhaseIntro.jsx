import { useState, useEffect } from 'react'

const INTROS = {
  collecting: {
    badge:    'FASE 1 — VERZAMELFASE',
    emoji:    '🔥',
    title:    ['De Oudsberg', 'brandt!'],
    who:      'Professor Rocket',
    quote:    '"Team Rocket heeft de Pokéshop geplunderd. Wilde Bokémon zijn ontsnapt naar de duinen. Vang ze — vóór wij dat doen."',
    sub:      'Twee teams. Één gebied. De race begint nu.',
    cta:      '⚡ Start de jacht',
    accent:   '#7c3aed',
    badgeBg:  '#2d1b69',
    quoteBg:  '#1a0f3a',
    border:   '#7c3aed',
  },
  training: {
    badge:    'FASE 2 — TRAININGSFASE',
    emoji:    '🌿',
    title:    ['De stilte', 'voor de storm'],
    who:      'Onderschept — Team Rocket',
    quote:    '"Ze hebben ze gevangen... maar ruw en ongeëvolueerd. Geef ze nog 15 minuten. Dan sturen we Mewtwo."',
    sub:      'Jullie hebben het gehoord. Evolueer nu — of verlies straks.',
    cta:      '🌿 Start training',
    accent:   '#16a34a',
    badgeBg:  '#0f2a0f',
    quoteBg:  '#0d2010',
    border:   '#16a34a',
  },
  tournament: {
    badge:    'FINALE — TOERNOOIFASE',
    emoji:    '👑',
    title:    ['Mewtwo', 'ontwaakt'],
    who:      'Team Rocket — laatste bericht',
    quote:    '"Hij is vrij. We kunnen hem niet meer stoppen. Alleen het sterkste team kan hem verslaan — als ze elkaar al overleven."',
    sub:      'Eerst: het interteamgevecht. Dan: de ultieme eindbaas.',
    cta:      '⚔️ Begin het toernooi',
    accent:   '#ea580c',
    badgeBg:  '#3b0d00',
    quoteBg:  '#1a0800',
    border:   '#ea580c',
  },
}

export default function PhaseIntro({ phase, onDismiss }) {
  const [step, setStep] = useState(0)

  const cfg = INTROS[phase]
  if (!cfg) return null

  // Stapsgewijze verschijning: 5 stappen met delay
  useEffect(() => {
    setStep(0)
    const delays = [600, 1400, 2600, 4200, 6000]
    const timers = delays.map((d, i) => setTimeout(() => setStep(i + 1), d))
    // Auto-dismiss na 14s
    const autoDismiss = setTimeout(onDismiss, 14000)
    return () => { timers.forEach(clearTimeout); clearTimeout(autoDismiss) }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  function fadeStyle(minStep, extra = {}) {
    return {
      opacity:    step >= minStep ? 1 : 0,
      transform:  step >= minStep ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
      ...extra,
    }
  }

  return (
    <div
      onClick={step >= 4 ? onDismiss : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#050510',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '32px 24px', gap: 0,
        cursor: step >= 4 ? 'pointer' : 'default',
      }}
    >
      <style>{`
        @keyframes introPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes introGlow {
          0%, 100% { text-shadow: 0 0 20px var(--glow-c, gold); }
          50% { text-shadow: 0 0 40px var(--glow-c, gold), 0 0 60px var(--glow-c, gold); }
        }
      `}</style>

      {/* Badge */}
      <div style={{
        ...fadeStyle(1),
        background: cfg.badgeBg, color: cfg.accent,
        fontSize: 10, fontWeight: 800, letterSpacing: 2,
        padding: '5px 14px', borderRadius: 20,
        marginBottom: 24, border: `1px solid ${cfg.accent}44`,
      }}>
        {cfg.badge}
      </div>

      {/* Groot emoji */}
      <div style={{
        ...fadeStyle(2),
        fontSize: 72, lineHeight: 1,
        animation: step >= 2 ? 'introPulse 2s ease-in-out infinite' : 'none',
        marginBottom: 20,
      }}>
        {cfg.emoji}
      </div>

      {/* Titel */}
      <div style={{
        ...fadeStyle(2),
        textAlign: 'center', marginBottom: 20,
      }}>
        {cfg.title.map((line, i) => (
          <div key={i} style={{
            fontSize: 28, fontWeight: 800, color: '#ffffff',
            lineHeight: 1.2,
            textShadow: step >= 2 ? `0 0 30px ${cfg.accent}88` : 'none',
          }}>
            {line}
          </div>
        ))}
      </div>

      {/* Scheidingslijn */}
      <div style={{
        ...fadeStyle(3),
        width: 40, height: 1, background: '#2a2a4a',
        marginBottom: 20,
      }} />

      {/* Quote */}
      <div style={{
        ...fadeStyle(3),
        background: cfg.quoteBg,
        borderLeft: `3px solid ${cfg.border}`,
        borderRadius: '0 10px 10px 0',
        padding: '12px 16px',
        width: '100%', maxWidth: 340,
        marginBottom: 16,
      }}>
        <div style={{
          fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
          color: cfg.accent, marginBottom: 6,
          textTransform: 'uppercase',
        }}>
          {cfg.who}
        </div>
        <div style={{
          fontSize: 13, color: '#ccccdd', lineHeight: 1.6, fontStyle: 'italic',
        }}>
          {cfg.quote}
        </div>
      </div>

      {/* Subtitel */}
      <div style={{
        ...fadeStyle(4),
        fontSize: 13, color: '#8888aa', lineHeight: 1.6,
        textAlign: 'center', marginBottom: 28,
      }}>
        {cfg.sub}
      </div>

      {/* CTA-knop */}
      <button
        onClick={onDismiss}
        style={{
          ...fadeStyle(5),
          background: cfg.accent, color: 'white',
          border: 'none', borderRadius: 14,
          padding: '14px 32px', fontSize: 16, fontWeight: 800,
          cursor: 'pointer', width: '100%', maxWidth: 300,
          animation: step >= 5 ? 'introPulse 1.4s ease-in-out infinite' : 'none',
        }}
      >
        {cfg.cta}
      </button>

      {/* Subtekst: tik om te sluiten (verschijnt bij stap 4) */}
      {step >= 4 && step < 5 && (
        <div style={{
          position: 'absolute', bottom: 32,
          fontSize: 12, color: '#4444668',
          opacity: 0.5,
        }}>
          tik om te sluiten
        </div>
      )}
    </div>
  )
}
