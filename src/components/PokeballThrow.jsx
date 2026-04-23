/**
 * Gameboy-stijl Pokéball throw animatie — puur visueel.
 * Geen timer-logica hier; de parent-component regelt wanneer dit
 * component unmount via eigen useEffect + setTimeout.
 */
export default function PokeballThrow({ emoji = '❓', label }) {
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
