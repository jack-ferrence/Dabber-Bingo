function parseTeams(name) {
  const parts = (name ?? '').split(' vs ')
  return {
    away: parts[0]?.trim() || '---',
    home: parts[1]?.trim() || '---',
  }
}

function formatTime(dateStr) {
  if (!dateStr) return 'Upcoming'
  try {
    return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return 'Upcoming'
  }
}

function isLateEntryOpen(room) {
  if (room.status !== 'live') return false
  const sport = room.sport || 'nba'
  const period = room.game_period ?? 0
  if (sport === 'nba') return period <= 1
  if (sport === 'ncaa') {
    const mins = parseInt((room.game_clock ?? '').split(':')[0], 10)
    return period <= 1 && !isNaN(mins) && mins >= 10
  }
  if (sport === 'mlb') return period <= 3
  return false
}

export default function MobileGameRow({ room, isJoined, joining, onJoin, onContinue }) {
  const { away, home } = parseTeams(room.name)
  const isLive = room.status === 'live'
  const isFinished = room.status === 'finished'
  const lateEntryOpen = isLateEntryOpen(room)
  const isNcaa = room.sport === 'ncaa'

  return (
    <div
      onClick={isJoined ? () => onContinue(room.id) : undefined}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 12px',
        background: '#12121e',
        borderRadius: 6,
        borderLeft: isLive ? '3px solid #ff2d2d' : '3px solid transparent',
        cursor: isJoined ? 'pointer' : 'default',
      }}
    >
      {/* Left: teams + status info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{ flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 800, color: '#8888aa', letterSpacing: '0.03em' }}>
            {away}
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#2a2a44', margin: '0 5px' }}>
            vs
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 800, color: '#e0e0f0', letterSpacing: '0.03em' }}>
            {home}
          </span>
        </div>
        <div>
          {isLive ? (
            <div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#ff2d2d', fontWeight: 700 }}>
                ● LIVE
              </span>
              {room.game_clock && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55', marginLeft: 6 }}>
                  {room.game_period ? `${room.sport === 'mlb' ? `Inn ${room.game_period}` : `Q${room.game_period}`} · ` : ''}{room.game_clock}
                </span>
              )}
            </div>
          ) : isFinished ? (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577' }}>FINAL</span>
          ) : (
            <div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577' }}>
                {formatTime(room.starts_at)}
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55', marginLeft: 6 }}>
                {room.participant_count ?? 0} playing
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Right: action button — stop propagation so row-click doesn't double-fire */}
      <div style={{ flexShrink: 0, marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
        {isFinished ? (
          isJoined ? (
            <button
              type="button"
              onClick={() => onContinue(room.id)}
              style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#555577', background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}
            >
              RESULTS
            </button>
          ) : (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55' }}>DONE</span>
          )
        ) : isLive && !isJoined && !lateEntryOpen ? (
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55' }}>CLOSED</span>
        ) : isJoined ? (
          <button
            type="button"
            onClick={() => onContinue(room.id)}
            style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', background: 'none', borderRadius: 3, padding: '4px 8px', cursor: 'pointer' }}
          >
            {isLive ? 'PLAYING' : 'JOINED'}
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
            <button
              type="button"
              onClick={() => onJoin(room.id)}
              disabled={joining}
              style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#0c0c14', background: '#ff6b35', border: 'none', borderRadius: 4, padding: '5px 12px', cursor: joining ? 'wait' : 'pointer' }}
            >
              {joining ? '...' : lateEntryOpen ? 'LATE JOIN' : 'JOIN'}
            </button>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 8, color: isNcaa ? '#22c55e' : '#3a3a55' }}>
              {isNcaa ? 'FREE' : '10 ◈'}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
