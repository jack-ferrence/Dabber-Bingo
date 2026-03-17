import { NBA_TEAM_COLORS, hexToRgba } from '../../constants/teamColors.js'
import { useProfile } from '../../hooks/useProfile.js'

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

export default function GameCard({ game, isJoined, joining, onJoin, onContinue }) {
  const { away, home } = parseTeams(game.name)
  const homeColor = NBA_TEAM_COLORS[home] ?? NBA_TEAM_COLORS.DEFAULT
  const awayColor = NBA_TEAM_COLORS[away] ?? NBA_TEAM_COLORS.DEFAULT
  const isLive = game.status === 'live'
  const { dabsBalance } = useProfile()
  const isNcaa = game.sport === 'ncaa'
  const ENTRY_COST = 10
  const canAfford = isNcaa || dabsBalance === null || dabsBalance >= ENTRY_COST

  return (
    <div
      className="game-card"
      style={{
        '--home-color': homeColor,
        '--team-glow': hexToRgba(homeColor, 0.30),
      }}
    >
      {/* Dual team-color gradient wash */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(135deg, ${hexToRgba(awayColor, 0.08)} 0%, transparent 42%, ${hexToRgba(homeColor, 0.08)} 100%)`,
          pointerEvents: 'none',
        }}
      />

      {/* LIVE badge */}
      {isLive && (
        <div style={{ position: 'absolute', top: 10, right: 10, zIndex: 1 }}>
          <span className="live-badge">
            <span className="live-dot" />
            LIVE
          </span>
        </div>
      )}

      {/* Team matchup */}
      <div
        className="flex items-end justify-between relative"
        style={{ padding: '18px 20px 12px' }}
      >
        <div className="flex flex-col items-center gap-1">
          <span className="team-abbr" style={{ color: awayColor }}>{away}</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.10em',
              color: '#555577',
              textTransform: 'uppercase',
            }}
          >
            Away
          </span>
        </div>

        <span className="vs-text" style={{ marginBottom: 16 }}>VS</span>

        <div className="flex flex-col items-center gap-1">
          <span className="team-abbr" style={{ color: homeColor }}>{home}</span>
          <span
            style={{
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.10em',
              color: '#555577',
              textTransform: 'uppercase',
            }}
          >
            Home
          </span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-between relative mt-auto"
        style={{
          padding: '9px 20px 16px',
          borderTop: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        <div>
          {isLive ? (
            <span
              style={{
                color: '#ff2d2d',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.05em',
              }}
            >
              ● IN PROGRESS
            </span>
          ) : (
            <span style={{ color: '#555577', fontSize: 11, fontWeight: 600 }}>
              {formatTipoff(game.starts_at)}
            </span>
          )}
          <div style={{ color: '#555577', fontSize: 11, marginTop: 2 }}>
            {game.participant_count ?? 0} playing
          </div>
        </div>

        {isJoined ? (
          <button
            type="button"
            onClick={() => onContinue(game.id)}
            className="btn-joined"
          >
            JOINED ✓
          </button>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <button
              type="button"
              onClick={() => onJoin(game.id)}
              disabled={joining || !canAfford}
              className="btn-join"
              title={!canAfford ? `Need ${ENTRY_COST} Dabs to join (you have ${dabsBalance})` : undefined}
              style={!canAfford ? { opacity: 0.45, cursor: 'not-allowed' } : undefined}
            >
              {joining ? '…' : 'JOIN'}
            </button>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, letterSpacing: '0.06em' }}>
              {isNcaa ? (
                <span style={{ color: '#22c55e' }}>FREE</span>
              ) : !canAfford ? (
                <span style={{ color: '#ff2d2d' }}>need {ENTRY_COST} ◈</span>
              ) : (
                <span style={{ color: '#555577' }}>{ENTRY_COST} ◈</span>
              )}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
