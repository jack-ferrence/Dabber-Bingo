import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, hexToRgba } from '../../constants/teamColors.js'

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

export default function GameCard({ game, onOpenGame, rank = 0 }) {
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

      {/* Placement medal for finished games */}
      {isFinished && rank > 0 && (
        <div style={{ position: 'absolute', top: 10, left: 14, zIndex: 1, display: 'flex', alignItems: 'center', gap: 3 }}>
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 22, fontWeight: 800, lineHeight: 1,
            color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#555577',
          }}>{rank}</span>
          {rank <= 3 && (
            <span style={{ fontSize: 14 }}>
              {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
            </span>
          )}
        </div>
      )}

      {/* Status badge */}
      <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
        {isLive ? (
          <span className="live-badge">
            <span className="live-dot" />
            LIVE
          </span>
        ) : isFinished ? (
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', color: '#555577', background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 3, padding: '2px 6px' }}>
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
          <span className="team-abbr" style={{ color: awayColor, opacity: 0.75 }}>{away}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', color: '#555577', textTransform: 'uppercase' }}>Away</span>
        </div>
        <span className="vs-text" style={{ marginBottom: 16 }}>VS</span>
        <div className="flex flex-col items-center gap-1">
          <span className="team-abbr" style={{ color: homeColor }}>{home}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.10em', color: '#555577', textTransform: 'uppercase' }}>Home</span>
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
              <span style={{ color: '#ff2d2d', fontSize: 11, fontWeight: 700, letterSpacing: '0.05em' }}>
                ● IN PROGRESS
              </span>
              <div style={{ color: '#555577', fontSize: 11, marginTop: 2 }}>
                {game.participant_count ?? 0} playing
              </div>
            </>
          ) : isFinished ? (
            <>
              <span style={{ color: '#555577', fontSize: 11, fontWeight: 700 }}>FINAL</span>
              {game.away_score != null && game.home_score != null && (
                <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 800, color: '#8888aa', marginTop: 2 }}>
                  {game.away_score} - {game.home_score}
                </div>
              )}
            </>
          ) : (
            <>
              {formatDateLabel(game.starts_at) && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', color: '#8888aa', textTransform: 'uppercase', display: 'block' }}>
                  {formatDateLabel(game.starts_at)}
                </span>
              )}
              <span style={{ color: '#555577', fontSize: 11, fontWeight: 600 }}>
                {formatTipoff(game.starts_at)}
              </span>
              <div style={{ color: '#555577', fontSize: 11, marginTop: 2 }}>
                {game.participant_count ?? 0} joined
              </div>
            </>
          )}
        </div>

        {/* Tap prompt */}
        <div style={{ textAlign: 'right' }}>
          {isFinished ? (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#555577', letterSpacing: '0.06em' }}>VIEW →</span>
          ) : (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#ff6b35', letterSpacing: '0.06em' }}>PLAY →</span>
          )}
        </div>
      </div>
    </div>
  )
}
