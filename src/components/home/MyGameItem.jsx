import { useNavigate } from 'react-router-dom'

const SPORT_ICONS = {
  nba:  '🏀',
  ncaa: '🏆',
  mlb:  '⚾',
  nhl:  '🏒',
  nfl:  '🏈',
}

function formatStartsAt(dateStr) {
  if (!dateStr) return 'Lobby'
  try {
    const time = new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    return `Starts ${time}`
  } catch {
    return 'Lobby'
  }
}

export default function MyGameItem({ room }) {
  const navigate = useNavigate()
  const isLive = room.status === 'live'
  const icon = SPORT_ICONS[room.sport ?? 'nba'] ?? '🏀'
  const lines = room.lines_completed ?? 0

  return (
    <button
      type="button"
      className="sidebar-game-item"
      onClick={() => navigate(`/room/${room.id}`)}
    >
      {/* Sport icon */}
      <span className="text-sm flex-shrink-0" aria-hidden="true">{icon}</span>

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p
          className="truncate text-sm font-semibold leading-tight"
          style={{ color: 'var(--db-text-primary)' }}
        >
          {room.name}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          {isLive ? (
            <span className="live-badge" style={{ fontSize: 8.5, padding: '2px 5px' }}>
              <span className="live-dot" style={{ width: 4, height: 4 }} />
              LIVE
            </span>
          ) : (
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'var(--db-text-ghost)' }}>
              {formatStartsAt(room.starts_at)}
            </span>
          )}
          {lines > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                color: 'var(--db-primary)',
                background: 'rgba(255,107,53,0.10)',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {lines} {lines === 1 ? 'line' : 'lines'}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
