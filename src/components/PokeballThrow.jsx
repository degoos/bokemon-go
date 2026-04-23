import { useEffect } from 'react'

/**
 * Gameboy-stijl Pokéball throw animatie.
 * Toont een fullscreen overlay met het Pokémon-emoji in het midden
 * en een pokeball die naar boven vliegt en "inslaat". Na ~1.3s roept
 * het onComplete aan.
 */
export default function PokeballThrow({ emoji = '❓', label, onComplete, durationMs = 1300 }) {
  useEffect(() => {
    const t = setTimeout(() => { onComplete && onComplete() }, durationMs)
    return () => clearTimeout(t)
  }, [onComplete, durationMs])

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
