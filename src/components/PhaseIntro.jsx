import { useState, useEffect } from 'react'

const INTROS = {
  collecting: {
    badge:    'FASE 1 — VERZAMELFASE',
    emoji:    '🔥',
    title:    ['De Oudsberg', 'brandt!'],
    who:      'Professor Rocket',
    quote:    '"Wat eruitziet als een verlaten Pokéshop is in werkelijkheid het geheime hoofdkwartier van Team Rocket — vol beveiligingssystemen en verstopte items. Wilde Bokémon zijn ontsnapt naar de duinen. Getraumatiseerd door gevangenschap en vuur verdrinken ze hun zorgen nu al eens in een druppeltje — daarom noemen andere pokémon deze rondzwervende outlaws smalend \'bokémons\'. Vang ze, breek het HQ binnen — vóór wij dat doen."',
    sub:      'Twee teams. Één gebied. De race begint nu.',
    cta:      '⚡ Start de jacht',
    accent:   '#7c3aed',
    badgeBg:  '#2d1b69',
    quoteBg:  '#1a0f3a',
    border:   '#7c3aed',
    cinematic: true,
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

// Duur van de cinematische prelude (alleen voor collecting)
const PRELUDE_MS = 7000

export default function PhaseIntro({ phase, onDismiss }) {
  const cfg = INTROS[phase]
  const [scene, setScene] = useState(cfg?.cinematic ? 'prelude' : 'main')
  const [step, setStep]   = useState(0)

  // Van prelude → main scene
  useEffect(() => {
    if (scene !== 'prelude') return
    const t = setTimeout(() => setScene('main'), PRELUDE_MS)
    return () => clearTimeout(t)
  }, [scene])

  // Stapsgewijze verschijning van de hoofdscene
  useEffect(() => {
    if (scene !== 'main') return
    setStep(0)
    const delays = [600, 1400, 2600, 4200, 6000]
    const timers = delays.map((d, i) => setTimeout(() => setStep(i + 1), d))
    const autoDismiss = setTimeout(onDismiss, 14000)
    return () => { timers.forEach(clearTimeout); clearTimeout(autoDismiss) }
  }, [scene]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!cfg) return null

  function fadeStyle(minStep, extra = {}) {
    return {
      opacity:    step >= minStep ? 1 : 0,
      transform:  step >= minStep ? 'translateY(0)' : 'translateY(16px)',
      transition: 'opacity 0.6s ease, transform 0.6s ease',
      ...extra,
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Prelude-scene: HQ brandt, Bokémon ontsnappen
  // ──────────────────────────────────────────────────────────────
  if (scene === 'prelude') {
    return (
      <div
        onClick={() => setScene('main')}
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'radial-gradient(circle at 50% 70%, #1a0a1a 0%, #050510 70%)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '24px', cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        <style>{`
          @keyframes prelude-fadein {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
          @keyframes prelude-stars {
            0%, 100% { opacity: 0.25; }
            50% { opacity: 0.55; }
          }
          @keyframes flame-flicker {
            0%, 100% { transform: scaleY(1) translateY(0); opacity: 0.9; }
            25% { transform: scaleY(1.2) translateY(-4px); opacity: 1; }
            50% { transform: scaleY(0.85) translateY(2px); opacity: 0.8; }
            75% { transform: scaleY(1.15) translateY(-2px); opacity: 1; }
          }
          @keyframes flame-sway {
            0%, 100% { transform: translateX(0) scaleX(1); }
            50% { transform: translateX(3px) scaleX(1.05); }
          }
          @keyframes smoke-rise {
            0%   { transform: translate(0, 0) scale(0.6); opacity: 0; }
            15%  { opacity: 0.55; }
            100% { transform: translate(calc(var(--sx, 0px)), -180px) scale(1.8); opacity: 0; }
          }
          @keyframes ember-rise {
            0%   { transform: translate(0, 0); opacity: 1; }
            100% { transform: translate(calc(var(--ex, 0px)), -140px); opacity: 0; }
          }
          @keyframes window-glow {
            0%, 100% { background: #2a1a08; box-shadow: inset 0 0 6px #000; }
            50% { background: #ff6a1f; box-shadow: inset 0 0 6px #ff8a3f, 0 0 8px #ff8a3f88; }
          }
          @keyframes escape-1 {
            0%   { transform: translate(0, 0) scale(0.5); opacity: 0; }
            20%  { opacity: 1; }
            100% { transform: translate(-180px, -60px) scale(1); opacity: 0; }
          }
          @keyframes escape-2 {
            0%   { transform: translate(0, 0) scale(0.5); opacity: 0; }
            20%  { opacity: 1; }
            100% { transform: translate(200px, -40px) scale(1); opacity: 0; }
          }
          @keyframes escape-3 {
            0%   { transform: translate(0, 0) scale(0.5); opacity: 0; }
            20%  { opacity: 1; }
            100% { transform: translate(-140px, 40px) scale(0.9); opacity: 0; }
          }
          @keyframes escape-4 {
            0%   { transform: translate(0, 0) scale(0.5); opacity: 0; }
            20%  { opacity: 1; }
            100% { transform: translate(170px, 50px) scale(0.9); opacity: 0; }
          }
          @keyframes escape-5 {
            0%   { transform: translate(0, 0) scale(0.5); opacity: 0; }
            20%  { opacity: 1; }
            100% { transform: translate(-90px, -90px) scale(0.85); opacity: 0; }
          }
          @keyframes shake {
            0%, 100% { transform: translate(0, 0); }
            10% { transform: translate(-2px, 1px); }
            30% { transform: translate(2px, -1px); }
            50% { transform: translate(-1px, 2px); }
            70% { transform: translate(1px, 1px); }
            90% { transform: translate(-1px, -2px); }
          }
        `}</style>

        {/* Sterren achtergrond */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
          {[...Array(14)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${(i * 37) % 100}%`,
              top:  `${(i * 53) % 60}%`,
              width: 2, height: 2, borderRadius: '50%',
              background: '#fff',
              animation: `prelude-stars ${2 + (i % 3)}s ease-in-out infinite`,
              animationDelay: `${(i % 5) * 0.3}s`,
            }} />
          ))}
        </div>

        {/* Maan */}
        <div style={{
          position: 'absolute', top: '12%', right: '16%',
          width: 42, height: 42, borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 35%, #fef3c7, #a16207)',
          boxShadow: '0 0 40px #fef3c744',
        }} />

        {/* Scene-container (met lichte shake) */}
        <div style={{
          position: 'relative',
          width: 260, height: 240,
          animation: 'shake 0.5s ease-in-out infinite',
          marginBottom: 32,
        }}>
          {/* Rook */}
          {[
            { delay: 0,   sx: '-30px', left: 70  },
            { delay: 0.5, sx: '20px',  left: 120 },
            { delay: 1.1, sx: '-10px', left: 160 },
            { delay: 1.7, sx: '40px',  left: 100 },
            { delay: 2.3, sx: '-40px', left: 140 },
          ].map((s, i) => (
            <div key={`smoke-${i}`} style={{
              position: 'absolute',
              left: s.left, top: 40,
              width: 40, height: 40, borderRadius: '50%',
              background: 'radial-gradient(circle, #5a4a5a 0%, #3a2a3a 60%, transparent 80%)',
              filter: 'blur(4px)',
              '--sx': s.sx,
              animation: `smoke-rise 3.5s ease-out infinite`,
              animationDelay: `${s.delay}s`,
            }} />
          ))}

          {/* Gebouw (HQ / Pokéshop) */}
          <div style={{
            position: 'absolute',
            left: 50, top: 110,
            width: 160, height: 100,
            background: 'linear-gradient(180deg, #3a2010 0%, #1a0a05 100%)',
            borderRadius: '4px 4px 0 0',
            border: '2px solid #0a0505',
            boxShadow: '0 0 20px #ff6a1f44',
          }}>
            {/* Dak */}
            <div style={{
              position: 'absolute',
              left: -12, top: -18,
              width: 184, height: 22,
              background: 'linear-gradient(180deg, #5a3020 0%, #2a1008 100%)',
              clipPath: 'polygon(0 100%, 10% 0, 90% 0, 100% 100%)',
            }} />

            {/* Windows (flickering orange) */}
            <div style={{
              position: 'absolute', left: 18, top: 22,
              width: 24, height: 20, borderRadius: 2,
              animation: 'window-glow 0.7s ease-in-out infinite',
              animationDelay: '0s',
            }} />
            <div style={{
              position: 'absolute', left: 68, top: 22,
              width: 24, height: 20, borderRadius: 2,
              animation: 'window-glow 0.5s ease-in-out infinite',
              animationDelay: '0.2s',
            }} />
            <div style={{
              position: 'absolute', left: 118, top: 22,
              width: 24, height: 20, borderRadius: 2,
              animation: 'window-glow 0.9s ease-in-out infinite',
              animationDelay: '0.1s',
            }} />
            {/* Deur */}
            <div style={{
              position: 'absolute', left: 66, top: 55,
              width: 28, height: 45, borderRadius: '2px 2px 0 0',
              background: 'radial-gradient(ellipse at center, #ff6a1f 0%, #2a1008 80%)',
              boxShadow: '0 0 16px #ff6a1faa',
            }} />
            {/* Scheef "PokéShop" bord */}
            <div style={{
              position: 'absolute', left: 18, top: 2,
              fontSize: 7, fontWeight: 800, letterSpacing: 1, color: '#facc15',
              background: '#0a0505', padding: '2px 4px',
              transform: 'rotate(-6deg)', borderRadius: 2,
              textShadow: '0 0 4px #facc15aa',
            }}>
              POKÉSHOP
            </div>
          </div>

          {/* Vlammen boven het gebouw */}
          {[
            { left: 55,  size: 44, delay: 0,    color: '#ff6a1f' },
            { left: 95,  size: 64, delay: 0.2,  color: '#ff3a1f' },
            { left: 135, size: 56, delay: 0.1,  color: '#ff8a3f' },
            { left: 175, size: 48, delay: 0.35, color: '#ff6a1f' },
          ].map((f, i) => (
            <div key={`flame-${i}`} style={{
              position: 'absolute',
              left: f.left, top: 110 - f.size + 10,
              width: 32, height: f.size,
              transformOrigin: 'bottom center',
              animation: `flame-flicker 0.35s ease-in-out infinite, flame-sway 1.4s ease-in-out infinite`,
              animationDelay: `${f.delay}s, ${f.delay * 0.5}s`,
            }}>
              <div style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(ellipse at 50% 100%, ${f.color} 0%, #ff8a3f 40%, #fef3c7 70%, transparent 85%)`,
                borderRadius: '50% 50% 45% 45% / 80% 80% 20% 20%',
                filter: 'blur(1px)',
                boxShadow: `0 0 20px ${f.color}99`,
              }} />
            </div>
          ))}

          {/* Ontsnappende Bokémon (gestippelde bolletjes) */}
          {[
            { anim: 'escape-1', emoji: '🔴', delay: 0.3 },
            { anim: 'escape-2', emoji: '🟢', delay: 0.7 },
            { anim: 'escape-3', emoji: '🟡', delay: 1.2 },
            { anim: 'escape-4', emoji: '🔵', delay: 1.8 },
            { anim: 'escape-5', emoji: '🟣', delay: 2.3 },
          ].map((b, i) => (
            <div key={`bok-${i}`} style={{
              position: 'absolute',
              left: 120, top: 170,
              fontSize: 18, lineHeight: 1,
              filter: 'drop-shadow(0 0 6px #000)',
              animation: `${b.anim} 3.2s ease-out infinite`,
              animationDelay: `${b.delay}s`,
            }}>
              {b.emoji}
            </div>
          ))}

          {/* Embers */}
          {[...Array(10)].map((_, i) => (
            <div key={`ember-${i}`} style={{
              position: 'absolute',
              left: 80 + (i * 13) % 120,
              top: 80,
              width: 3, height: 3, borderRadius: '50%',
              background: '#ff8a3f',
              boxShadow: '0 0 4px #ffaa5f',
              '--ex': `${((i * 17) % 80) - 40}px`,
              animation: `ember-rise ${1.5 + (i % 3) * 0.5}s ease-out infinite`,
              animationDelay: `${(i * 0.2) % 2}s`,
            }} />
          ))}
        </div>

        {/* Caption onderaan */}
        <div style={{
          textAlign: 'center',
          maxWidth: 320,
          animation: 'prelude-fadein 0.8s ease 0.5s both',
        }}>
          <div style={{
            fontSize: 11, fontWeight: 800, letterSpacing: 2.5,
            color: '#ef4444', marginBottom: 8,
            textTransform: 'uppercase',
          }}>
            De Oudsberg — vannacht
          </div>
          <div style={{
            fontSize: 14, color: '#ddd', lineHeight: 1.5,
            fontStyle: 'italic',
            textShadow: '0 0 8px #000',
          }}>
            Team Rocket steekt hun eigen <span style={{ color: '#facc15' }}>Pokéshop</span> in brand.
            <br />
            Gevangen Bokémon ontsnappen naar de duinen...
          </div>
        </div>

        {/* tik-hint */}
        <div style={{
          position: 'absolute', bottom: 24,
          fontSize: 11, color: '#555577',
          opacity: 0.7,
          animation: 'prelude-fadein 0.6s ease 3s both',
        }}>
          tik om door te gaan
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────────────────────────
  // Hoofdscene: badge / titel / quote / CTA
  // ──────────────────────────────────────────────────────────────
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
