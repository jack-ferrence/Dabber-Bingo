import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, hexToRgba } from '../../constants/teamColors.js'

function ordinal(n) {
  if (n <= 0) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return '#' + n + (s[(v - 20) % 10] || s[v] || s[0])
}

function parseTeams(name) {
  const parts = (name ?? '').split(' vs ')
  return {
    away: parts[0]?.trim() || '---',
    home: parts[1]?.trim() || '---',
  }
}

function formatTipoff(dateStr) {
  if (!dateStr) return 'Upcoming'
  try {
    return new Date(dateStr).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  } catch {
    return 'Upcoming'
  }
}

function formatDateLabel(dateStr) {
  if (!dateStr) return null
  try {
    const gameDate = new Date(dateStr)
    const gamePacific = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(gameDate)
    const todayPacific = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date())
    if (gamePacific === todayPacific) return null
    return gameDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'America/Los_Angeles',
    })
  } catch {
    return null
  }
}

function getTeamColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? MLB_TEAM_COLORS.DEFAULT
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? NCAA_TEAM_COLORS.DEFAULT
  return NBA_TEAM_COLORS[abbr] ?? NBA_TEAM_COLORS.DEFAULT
}

export default function GameCard({ game, onOpenGame, rank = 0, isPlaying = false }) {
  const { away, home } = parseTeams(game.name)
  const homeColor = getTeamColor(home, game.sport)
  const awayColor = getTeamColor(away, game.sport)
  const isLive = game.status === 'live'
  const isFinished = game.status === 'finished'

  return (
    <div
      className="game-card"
      onClick={() => onOpenGame(game.id)}
      style={{
        '--home-color': homeColor,
        '--team-glow': hexToRgba(homeColor, 0.25),
        cursor: 'pointer',
      }}
    >
      {/* Dual team-color gradient wash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${hexToRgba(awayColor, 0.22)} 0%, transparent 45%, ${hexToRgba(homeColor, 0.22)} 100%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Team color top strip */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(to right, ${awayColor}, ${homeColor})`,
        pointerEvents: 'none',
      }} />

      {/* Team color bottom strip */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
        background: `linear-gradient(to right, ${awayColor} 0%, ${awayColor} 50%, ${homeColor} 50%, ${homeColor} 100%)`,
        opacity: 0.6,
        pointerEvents: 'none',
      }} />

      {/* Joined badge — lobby or live, not finished */}
      {isPlaying && !isFinished && (
        <div style={{ position: 'absolute', top: 10, left: 14, zIndex: 2 }}>
          <span style={{
            fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 600,
            color: '#22c55e', background: 'rgba(34,197,94,0.1)',
            border: '1px solid rgba(34,197,94,0.22)', borderRadius: 10, padding: '2px 8px',
          }}>
            ✓ IN
          </span>
        </div>
      )}

      {/* Placement medal for finished games */}
      {isFinished && rank > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 14, zIndex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 18, fontWeight: 800, lineHeight: 1,
            color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'rgba(255,255,255,0.2)',
          }}>{ordinal(rank)}</span>
          {rank <= 3 && (
            <span style={{ fontSize: 14 }}>
              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
            </span>
          )}
        </div>
      )}

      {/* Status badge */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1, display: 'flex', alignItems: 'center', gap: 4 }}>
        {isLive ? (
          <>
            <span className="live-badge">
              <span className="live-dot" />
              LIVE
            </span>
            {!isPlaying && (
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #ff7a45, #e05520)', padding: '2px 7px', borderRadius: 4 }}>NEW</span>
            )}
          </>
        ) : isFinished ? (
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 7px' }}>
            FINAL
          </span>
        ) : null}
      </div>

      {/* Team matchup */}
      <div
        className="flex items-end justify-between relative"
        style={{ padding: '18px 20px 12px' }}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="team-abbr" style={{ color: awayColor, opacity: 0.8 }}>{away}</span>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Away</span>
        </div>
        <span className="vs-text" style={{ marginBottom: 16 }}>VS</span>
        <div className="flex flex-col items-center gap-1">
          <span className="team-abbr" style={{ color: homeColor }}>{home}</span>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>Home</span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between relative mt-auto"
        style={{ padding: '9px 20px 16px', borderTop: '1px solid rgba(0,0,0,0.05)' }}
      >
        <div>
          {isLive ? (
            <>
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, color: '#ff4444' }}>
                ● In progress
              </span>
              <div style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {game.participant_count ?? 0} playing
              </div>
            </>
          ) : isFinished ? (
            <>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)' }}>FINAL</span>
              {game.away_score != null && game.home_score != null && (
                <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.3)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
                  {game.away_score} – {game.home_score}
                </div>
              )}
            </>
          ) : (
            <>
              {formatDateLabel(game.starts_at) && (
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', display: 'block' }}>
                  {formatDateLabel(game.starts_at)}
                </span>
              )}
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                {formatTipoff(game.starts_at)}
              </span>
              <div style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {game.participant_count ?? 0} joined
              </div>
            </>
          )}
        </div>

        {/* Tap prompt */}
        <div style={{ textAlign: 'right', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          {isLive && isPlaying && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e', display: 'inline-block', boxShadow: '0 0 4px rgba(34,197,94,0.5)', marginRight: 4 }} />
          )}
          {isFinished ? (
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)' }}>View →</span>
          ) : (
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 700, color: '#ff6b35' }}>{isLive && isPlaying ? 'Continue →' : 'Play →'}</span>
          )}
        </div>
      </div>
    </div>
  )
}
