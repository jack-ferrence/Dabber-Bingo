import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, hexToRgba } from '../../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? MLB_TEAM_COLORS.DEFAULT
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? NCAA_TEAM_COLORS.DEFAULT
  return NBA_TEAM_COLORS[abbr] ?? NBA_TEAM_COLORS.DEFAULT
}

export default function MobileGameRow({ room, onOpenGame, isMyRoom = false }) {
  const nameParts = (room.name ?? '').split(' vs ')
  const away = nameParts[0]?.trim() || '---'
  const home = nameParts[1]?.trim() || '---'
  const isLive = room.status === 'live'
  const isFinished = room.status === 'finished'
  const homeColor = getTeamColor(home, room.sport)
  const awayColor = getTeamColor(away, room.sport)

  return (
    <div
      onClick={() => onOpenGame(room.id)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '11px 14px',
        borderRadius: 8,
        background: isMyRoom && !isLive && !isFinished
          ? `linear-gradient(135deg, ${hexToRgba(awayColor, 0.1)} 0%, transparent 40%, ${hexToRgba(homeColor, 0.1)} 100%)`
          : `linear-gradient(to right, ${hexToRgba(awayColor, 0.05)}, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.02) 70%, ${hexToRgba(homeColor, 0.05)})`,
        border: isMyRoom && !isLive && !isFinished
          ? `1px solid ${hexToRgba(homeColor, 0.18)}`
          : '1px solid var(--db-border-hover)',
        borderLeft: isMyRoom ? '3px solid #22c55e' : isLive ? '3px solid #ff2d2d' : isFinished ? '3px solid var(--db-border-default)' : `3px solid ${homeColor}`,
        cursor: 'pointer',
        transition: 'background 120ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Top color strip for joined lobby rows */}
      {isMyRoom && !isLive && !isFinished && (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, ${awayColor}, ${homeColor})`, borderRadius: '8px 8px 0 0', pointerEvents: 'none' }} />
      )}

      {/* Left: teams + status */}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 22, letterSpacing: '0.03em', color: isFinished ? 'var(--db-text-ghost)' : awayColor }}>
            {away}
          </span>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 400, color: 'var(--db-text-ghost)' }}>
            vs
          </span>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 22, letterSpacing: '0.03em', color: isFinished ? 'var(--db-text-ghost)' : homeColor }}>
            {home}
          </span>
        </div>
        <div style={{ marginTop: 3 }}>
          {isLive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff2d2d', display: 'inline-block', animation: 'pulse-live 1.4s ease-in-out infinite', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, color: '#ff4444', letterSpacing: '0.06em' }}>LIVE</span>
              {room.game_clock && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 600, color: 'var(--db-text-secondary)', marginLeft: 2 }}>
                  {room.game_period ? `${room.sport === 'mlb' ? `Inn ${room.game_period}` : `Q${room.game_period}`} · ` : ''}{room.game_clock}
                </span>
              )}
              {room.away_score != null && room.home_score != null && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 800, color: 'var(--db-text-primary)', marginLeft: 4 }}>
                  {room.away_score} - {room.home_score}
                </span>
              )}
            </div>
          ) : isFinished ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--db-text-ghost)' }}>FINAL</span>
              {room.away_score != null && room.home_score != null && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'var(--db-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                  {room.away_score}–{room.home_score}
                </span>
              )}
            </div>
          ) : (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'var(--db-text-muted)' }}>
              {room.starts_at
                ? new Date(room.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : 'Upcoming'}
            </span>
          )}
        </div>
      </div>

      {/* Right: joined badge or action cue */}
      <div style={{ flexShrink: 0, marginLeft: 12, textAlign: 'right' }}>
        {isMyRoom ? (
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 12,
            color: '#22c55e', background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.18)', borderRadius: 10, padding: '3px 10px',
            whiteSpace: 'nowrap',
          }}>
            ✓ IN
          </span>
        ) : isFinished ? (
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, color: 'var(--db-text-ghost)' }}>View →</span>
        ) : isLive ? (
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 600, color: '#ff6b35' }}>Play →</span>
        ) : (
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, color: 'var(--db-text-ghost)' }}>Play →</span>
        )}
      </div>
    </div>
  )
}
