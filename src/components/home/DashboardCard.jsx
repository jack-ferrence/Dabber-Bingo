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

function localDateStr(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function getDayPrefix(startsAt) {
  if (!startsAt) return ''
  const gameDate = localDateStr(new Date(startsAt))
  const today = localDateStr(new Date())
  const tomorrow = localDateStr(new Date(Date.now() + 86_400_000))
  if (gameDate === today) return 'Today'
  if (gameDate === tomorrow) return 'Tomorrow'
  return new Date(startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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

  const oddsStatus = room.odds_status ?? 'pending'
  const msUntilStart = room.starts_at ? new Date(room.starts_at) - Date.now() : Infinity
  const showPropsWarning = !isLive && !isFinished
    && oddsStatus !== 'ready'
    && msUntilStart < 2 * 60 * 60 * 1000
    && msUntilStart > 0

  const isLiveSize = size === 'live'
  const teamFontSize = isLiveSize ? 'clamp(22px, 5vw, 28px)' : 'clamp(18px, 4vw, 22px)'
  const scoreFontSize = isLiveSize ? 'clamp(20px, 4.5vw, 24px)' : 'clamp(16px, 3.5vw, 18px)'
  const baseOpacity = isFinished ? 0.2 : isLiveSize ? 0.5 : 0.35
  const gradientOpacity = baseOpacity

  const clockLabel = isLive ? getClock(room) : ''
  const hasScore = room.away_score != null && room.home_score != null

  return (
    <div
      onClick={() => onOpenGame(room.id)}
      className="dashboard-card"
      data-size={size}
      style={{
        flexShrink: 0,
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
          background: `linear-gradient(145deg, ${hexToRgba(awayColor, gradientOpacity)} 0%, var(--db-bg-surface) 50%, ${hexToRgba(homeColor, gradientOpacity)} 100%)`,
          padding: isLiveSize ? '16px 18px 14px' : '14px 16px 12px',
          minHeight: isLiveSize ? 150 : 120,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          border: '1px solid var(--db-border-subtle)',
          borderRadius: 14,
          boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Team color accent strips */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 3,
          background: `linear-gradient(to right, ${awayColor}, ${homeColor})`,
          opacity: isFinished ? 0.3 : 0.7,
        }} />
        {/* Top row: status + joined badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: isLiveSize ? 10 : 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {isLive && (
              <>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--db-live)', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-primary)', fontWeight: 600 }}>
                  LIVE{clockLabel ? ` · ${clockLabel}` : ''}
                </span>
              </>
            )}
            {isFinished && (
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-ghost)', fontWeight: 600 }}>FINAL</span>
            )}
            {!isLive && !isFinished && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
                {getDayPrefix(room.starts_at) !== 'Today' && (
                  <span style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700,
                    color: getDayPrefix(room.starts_at) === 'Tomorrow' ? 'var(--db-primary)' : 'var(--db-text-ghost)',
                    letterSpacing: '0.04em', textTransform: 'uppercase',
                  }}>
                    {getDayPrefix(room.starts_at)}
                  </span>
                )}
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-muted)', fontWeight: 500 }}>
                  {formatTime(room.starts_at)}
                </span>
              </div>
            )}
          </div>

          {isJoined && !isFinished && (
            <span style={{
              fontSize: 10, color: 'var(--db-success)', fontWeight: 700, letterSpacing: '0.04em',
              background: 'rgba(34,197,94,0.12)', padding: '3px 8px', borderRadius: 5,
            }}>✓ JOINED</span>
          )}

          {isFinished && rank > 0 && (
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: 14, fontWeight: 800,
              color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'var(--db-text-muted)',
            }}>
              {rank <= 3 ? ['\u{1F947}','\u{1F948}','\u{1F949}'][rank-1] : `#${rank}`}
            </span>
          )}
        </div>

        {/* Team names */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: isLiveSize ? 10 : 8 }}>
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: teamFontSize, fontWeight: 900,
              color: isFinished ? 'var(--db-text-muted)' : 'var(--db-text-bright)',
              letterSpacing: '0.01em', lineHeight: 1,
            }}>{away}</span>
            <span style={{ fontSize: 11, color: 'var(--db-text-ghost)' }}>vs</span>
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: teamFontSize, fontWeight: 900,
              color: isFinished ? 'var(--db-text-muted)' : 'var(--db-text-bright)',
              letterSpacing: '0.01em', lineHeight: 1,
            }}>{home}</span>
          </div>

          {hasScore && (
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: scoreFontSize,
              color: isFinished ? 'var(--db-text-ghost)' : 'var(--db-text-secondary)',
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
              <div style={{ flex: 1, height: 5, background: 'var(--db-bg-active)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ width: `${Math.min(100, (squaresMarked / 25) * 100)}%`, height: '100%', background: 'var(--db-primary)', borderRadius: 3 }} />
              </div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-secondary)', fontWeight: 700 }}>
                {squaresMarked}/25
              </span>
            </div>
          )}

          {isJoined && !isFinished && squaresMarked == null && (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-ghost)' }}>
              {sport.toUpperCase()}{room.participant_count ? ` · ${room.participant_count} playing` : ''}
            </span>
          )}

          {!isJoined && !isFinished && (
            <>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-primary)', fontWeight: 600 }}>
                {isLive ? 'Join late →' : 'Join game →'}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-ghost)' }}>
                  {sport.toUpperCase()}{room.participant_count ? ` · ${room.participant_count} playing` : ''}
                </span>
                {showPropsWarning && (
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 4, padding: '2px 6px', letterSpacing: '0.04em' }}>
                    CARD PENDING
                  </span>
                )}
              </div>
            </>
          )}

          {isFinished && (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-muted)' }}>
              {sport.toUpperCase()} · Finished
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
