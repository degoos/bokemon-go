import { useEffect, useRef } from 'react'

/**
 * Gameboy-stijl Pokéball throw animatie.
 * Toont een fullscreen overlay met het Pokémon-emoji in het midden
 * en een pokeball die naar boven vliegt en "inslaat". Na ~1.3s roept
 * het onComplete aan.
 *
 * onComplete staat NIET in de dependency array — de timer start één keer
 * bij mount en wordt niet gereset bij re-renders van de parent (die bij
 * elke realtime update een nieuwe callback-referentie aanmaken).
 */
export default function PokeballThrow({ emoji = '❓', label, onComplete, durationMs = 1300 }) {
  const onCompleteRef = useRef(onComplete)
  onCompleteRef.current = onComplete

  useEffect(() => {
    const t = setTimeout(() => { onCompleteRef.current?.() }, durationMs)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [durationMs]) // bewust geen onComplete — zie commentaar hierboven

  return (
    <div className="pokeball-overlay" role="presentation">
      <div className="pokeball-target">{emoji}</div>
      <div className="pokeball" />
      <div className="pokeball-flash" />
      <div className="pokeball-caption">
        {label || 'GO!'}
      </div>
    </div>
  )
}
