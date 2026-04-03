import DobberBallIcon from './DobberBallIcon.jsx'

/** Renders a badge emoji — handles the 'dobber_ball' sentinel that maps to an SVG icon. */
export default function BadgeEmoji({ emoji, size = 14 }) {
  if (emoji === 'dobber_ball') {
    return <DobberBallIcon size={size} />
  }
  return <span style={{ fontSize: size, lineHeight: 1 }}>{emoji}</span>
}
