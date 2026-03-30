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
        padding: '10px 12px',
        borderRadius: 8,
        background: `linear-gradient(to right, ${hexToRgba(awayColor, 0.06)}, rgba(255,255,255,0.03) 30%, rgba(255,255,255,0.03) 70%, ${hexToRgba(homeColor, 0.06)})`,
        border: '1px solid rgba(255,255,255,0.06)',
        borderLeft: isMyRoom ? '3px solid #22c55e' : isLive ? '3px solid #ff2d2d' : isFinished ? '3px solid rgba(255,255,255,0.1)' : `3px solid ${homeColor}`,
        cursor: 'pointer',
        transition: 'background 120ms ease',
      }}
    >
      {/* Left: teams + status info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        <div style={{ flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 17, letterSpacing: '0.03em', color: awayColor, opacity: 0.85 }}>
            {away}
          </span>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.2)', margin: '0 5px' }}>
            vs
          </span>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 17, letterSpacing: '0.03em', color: homeColor }}>
            {home}
          </span>
        </div>
        <div>
          {isLive ? (
            <div>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, color: '#ff4444', letterSpacing: '0.06em' }}>
                ● LIVE
              </span>
              {room.game_clock && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.25)', marginLeft: 6 }}>
                  {room.game_period ? `${room.sport === 'mlb' ? `Inn ${room.game_period}` : `Q${room.game_period}`} · ` : ''}{room.game_clock}
                </span>
              )}
            </div>
          ) : isFinished ? (
            <div>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.2)' }}>FINAL</span>
              {room.away_score != null && room.home_score != null && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginLeft: 6, fontVariantNumeric: 'tabular-nums' }}>
                  {room.away_score}–{room.home_score}
                </span>
              )}
            </div>
          ) : (
            <div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.35)' }}>
                {room.starts_at
                  ? new Date(room.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                  : 'Upcoming'}
              </span>
              {isMyRoom ? (
                <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, color: '#22c55e', marginLeft: 6, letterSpacing: '0.06em' }}>
                  ✓ YOU'RE IN
                </span>
              ) : (
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, color: 'rgba(255,255,255,0.2)', marginLeft: 6 }}>
                  {room.participant_count ?? 0} joined
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: tap cue */}
      <div style={{ flexShrink: 0, marginLeft: 8 }}>
        {isFinished ? (
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.2)' }}>View →</span>
        ) : isLive ? (
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 600, color: '#ff6b35' }}>Play →</span>
        ) : (
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.25)' }}>Play →</span>
        )}
      </div>
    </div>
  )
}
