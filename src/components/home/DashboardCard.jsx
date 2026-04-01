import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, hexToRgba } from '../../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#475569'
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? '#475569'
  return NBA_TEAM_COLORS[abbr] ?? '#475569'
}

function parseTeams(name) {
  const parts = (name ?? '').split(' vs ')
  return { away: parts[0]?.trim() || '???', home: parts[1]?.trim() || '???' }
}

function formatTime(startsAt) {
  if (!startsAt) return ''
  const d = new Date(startsAt)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function getClock(room) {
  const period = room.game_period ?? 0
  const clock = room.game_clock ?? ''
  const sport = room.sport ?? 'nba'
  if (sport === 'mlb') return period > 0 ? `Top ${period}` : ''
  if (sport === 'ncaa') return period > 0 ? `H${period} ${clock}` : clock
  return period > 0 ? `Q${period} ${clock}` : clock
}

export default function DashboardCard({ room, onOpenGame, isJoined = false, size = 'large', rank = 0, squaresMarked = null }) {
  const { away, home } = parseTeams(room.name)
  const awayColor = getTeamColor(away, room.sport)
  const homeColor = getTeamColor(home, room.sport)
  const isLive = room.status === 'live'
  const isFinished = room.status === 'finished'
  const sport = room.sport ?? 'nba'

  const widths = { large: 280, medium: 260, small: 240, tiny: 200 }
  const cardWidth = widths[size] ?? 260
  const teamFontSize = size === 'large' ? 36 : size === 'medium' ? 32 : size === 'small' ? 28 : 24
  const scoreFontSize = size === 'large' ? 24 : size === 'medium' ? 20 : 18
  const gradientOpacity = isFinished ? 0.2 : size === 'small' || size === 'tiny' ? 0.35 : 0.5

  const clockLabel = isLive ? getClock(room) : ''
  const hasScore = room.away_score != null && room.home_score != null

  return (
    <div
      onClick={() => onOpenGame(room.id)}
      style={{
        flexShrink: 0,
        width: cardWidth,
        borderRadius: 14,
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        scrollSnapAlign: 'start',
        transition: 'transform 100ms cubic-bezier(0.2,0,0,1)',
      }}
    >
      <div
        style={{
          background: `linear-gradient(145deg, ${hexToRgba(awayColor, gradientOpacity)} 0%, #0c0c14 50%, ${hexToRgba(homeColor, gradientOpacity)} 100%)`,
          padding: size === 'tiny' ? '12px 14px 10px' : '16px 18px 14px',
          minHeight: size === 'large' ? 150 : size === 'medium' ? 135 : size === 'small' ? 115 : 95,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: '1px solid rgba(255,255,255,0.04)',
          borderRadius: 14,
        }}
      >
        {/* Top row: status + joined badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: size === 'tiny' ? 6 : 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {isLive && (
              <>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff2d2d', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                  LIVE{clockLabel ? ` · ${clockLabel}` : ''}
                </span>
              </>
            )}
            {isFinished && (
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.35)', fontWeight: 600 }}>FINAL</span>
            )}
            {!isLive && !isFinished && (
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                {formatTime(room.starts_at)}
              </span>
            )}
          </div>

          {isJoined && !isFinished && (
            <span style={{
              fontSize: 10, color: '#22c55e', fontWeight: 700, letterSpacing: '0.04em',
              background: 'rgba(34,197,94,0.12)', padding: '3px 8px', borderRadius: 5,
            }}>✓ JOINED</span>
          )}

          {isFinished && rank > 0 && (
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: 14, fontWeight: 800,
              color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'rgba(255,255,255,0.3)',
            }}>
              {rank <= 3 ? ['\u{1F947}','\u{1F948}','\u{1F949}'][rank-1] : `#${rank}`}
            </span>
          )}
        </div>

        {/* Team names */}
        <div style={{ marginBottom: size === 'tiny' ? 4 : 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: size === 'tiny' ? 6 : 10 }}>
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: teamFontSize,
              color: isFinished ? 'rgba(255,255,255,0.4)' : '#fff',
              letterSpacing: '0.02em', lineHeight: 1,
            }}>{away}</span>
            <span style={{ fontSize: size === 'tiny' ? 9 : 11, color: 'rgba(255,255,255,0.3)' }}>vs</span>
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: teamFontSize,
              color: isFinished ? 'rgba(255,255,255,0.4)' : '#fff',
              letterSpacing: '0.02em', lineHeight: 1,
            }}>{home}</span>
          </div>

          {hasScore && (
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: scoreFontSize,
              color: isFinished ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.55)',
              marginTop: 2, display: 'block',
            }}>
              {room.away_score} — {room.home_score}
            </span>
          )}
        </div>

        {/* Bottom row */}
        <div>
          {isJoined && !isFinished && squaresMarked != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 5, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (squaresMarked / 25) * 100)}%`, height: '100%', background: '#ff6b35', borderRadius: 3 }} />
              </div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
                {squaresMarked}/25
              </span>
            </div>
          )}

          {isJoined && !isFinished && squaresMarked == null && (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>
              {sport.toUpperCase()}{room.participant_count ? ` · ${room.participant_count} playing` : ''}
            </span>
          )}

          {!isJoined && !isFinished && (
            <>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#ff6b35', fontWeight: 600 }}>
                {isLive ? 'Join late →' : 'Join game →'}
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, display: 'block' }}>
                {sport.toUpperCase()}{room.participant_count ? ` · ${room.participant_count} playing` : ''}
              </span>
            </>
          )}

          {isFinished && (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
              {sport.toUpperCase()} · Finished
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
