/**
 * TeamEmoji — rendert een team-emoji met automatische kleurcorrectie.
 *
 * De Unicode-emoji 🧢 ("billed cap") wordt op iOS/Android als blauwe pet
 * gerenderd. Voor Team Ash willen we een rode pet (zijn signature). Dit
 * component past een CSS hue-rotate filter toe die de blauwe pet rood
 * kleurt — zonder dat we Unicode-assets of custom SVG's moeten bouwen.
 *
 * Gebruik:
 *   <TeamEmoji emoji={team.emoji} />
 *   <TeamEmoji emoji={team.emoji} style={{ fontSize: 24 }} />
 *
 * Alleen de 🧢 krijgt de filter — alle andere emoji's renderen normaal.
 */

export default function TeamEmoji({ emoji, style, className = '', as: Tag = 'span', ...rest }) {
  const isBlueCap = emoji === '🧢'
  const cls = [className, isBlueCap ? 'cap-red' : ''].filter(Boolean).join(' ')
  return (
    <Tag className={cls || undefined} style={style} {...rest}>
      {emoji}
    </Tag>
  )
}
