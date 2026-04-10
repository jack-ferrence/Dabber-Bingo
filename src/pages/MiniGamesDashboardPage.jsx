import { Link, useNavigate } from 'react-router-dom'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticSelection } from '../lib/haptics.js'

const GAMES = [
  {
    key: 'derby',
    title: 'HOME RUN DERBY',
    desc: 'Time your swings to crush dingers',
    reward: 'Up to 100+ Dobs',
    path: '/daily/derby',
    field: 'derby_completed',
    dobsField: 'derby_dobs_earned',
    emoji: '⚾',
    color: '#e74c3c',
  },
  {
    key: 'passer',
    title: 'POCKET PASSER',
    desc: 'Read the defense and hit open receivers',
    reward: 'Up to 80 Dobs',
    path: '/daily/passer',
    field: 'passer_completed',
    dobsField: 'passer_dobs_earned',
    emoji: '🏈',
    color: '#8b4513',
  },
  {
    key: 'flick',
    title: 'FLICK TO SCORE',
    desc: 'Drag and release to sink buckets',
    reward: 'Up to 100+ Dobs',
    path: '/daily/flick',
    field: 'flick_completed',
    dobsField: 'flick_dobs_earned',
    emoji: '🏀',
    color: '#e67e22',
  },
]

export default function MiniGamesDashboardPage() {
  const navigate = useNavigate()
  const { activity, loading } = useDailyActivity()

  const completedCount = GAMES.filter((g) => activity?.[g.field]).length
  const totalDobsEarned = GAMES.reduce((sum, g) => sum + (activity?.[g.dobsField] ?? 0), 0)

  return (
    <main className="page-enter" style={{ paddingBottom: 40, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ padding: '20px 20px 0' }}>
        <Link to="/" className="back-btn" aria-label="Back to home">
          ← Back
        </Link>

        <h1 style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
          fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
          color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)',
          margin: '8px 0 4px',
        }}>
          MINI GAMES
        </h1>
        <p style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
          color: 'var(--db-text-muted)', margin: '0 0 6px',
        }}>
          Play all 3 daily games to keep your streak alive.
        </p>

        {/* Progress bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20,
        }}>
          <div style={{
            flex: 1, height: 6, borderRadius: 3,
            background: 'var(--db-bg-elevated)',
            overflow: 'hidden',
          }}>
            <div style={{
              width: `${(completedCount / 3) * 100}%`,
              height: '100%', borderRadius: 3,
              background: completedCount === 3
                ? 'var(--db-success)'
                : 'var(--db-gradient-primary)',
              transition: 'width 300ms ease',
            }} />
          </div>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
            color: completedCount === 3 ? 'var(--db-success)' : 'var(--db-text-muted)',
            fontWeight: 'var(--db-weight-bold)',
            whiteSpace: 'nowrap',
          }}>
            {completedCount}/3
          </span>
        </div>
      </div>

      {/* Game cards */}
      <div className="pick-stagger" style={{ padding: '0 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {loading ? (
          [1, 2, 3].map((i) => (
            <div key={i} style={{
              height: 110, borderRadius: 14, background: 'var(--db-bg-elevated)',
              animation: 'pulse 1.8s ease-in-out infinite',
              animationDelay: `${i * 80}ms`,
            }} />
          ))
        ) : (
          GAMES.map((game) => {
            const done = activity?.[game.field] ?? false
            const dobsEarned = activity?.[game.dobsField] ?? 0

            return (
              <button
                key={game.key}
                type="button"
                className="daily-btn btn-press"
                onClick={() => { hapticSelection(); navigate(game.path) }}
                style={{
                  width: '100%', padding: 0, borderRadius: 14,
                  background: done ? 'rgba(34,197,94,0.05)' : 'var(--db-bg-surface)',
                  border: done
                    ? '1.5px solid rgba(34,197,94,0.2)'
                    : '1.5px solid var(--db-border-subtle)',
                  cursor: 'pointer', textAlign: 'left',
                  transition: 'all 150ms ease',
                  overflow: 'hidden', position: 'relative',
                }}
              >
                {/* Top accent */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                  background: done
                    ? 'var(--db-success)'
                    : `linear-gradient(90deg, ${game.color}, var(--db-primary))`,
                  opacity: done ? 0.5 : 0.7,
                }} />

                <div style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '18px 18px 16px',
                }}>
                  {/* Emoji icon */}
                  <div style={{
                    width: 52, height: 52, borderRadius: 12,
                    background: done ? 'rgba(34,197,94,0.1)' : `rgba(255,107,53,0.08)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 26, flexShrink: 0,
                  }}>
                    {done ? (
                      <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
                        <circle cx="13" cy="13" r="11" fill="rgba(34,197,94,0.2)" stroke="var(--db-success)" strokeWidth="1.5" />
                        <path d="M9 13.5L11.5 16L17 10.5" stroke="var(--db-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : game.emoji}
                  </div>

                  {/* Text */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{
                      fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
                      letterSpacing: 'var(--db-tracking-wide)',
                      color: done ? 'var(--db-text-muted)' : 'var(--db-text-primary)',
                      display: 'block', lineHeight: 'var(--db-leading-tight)',
                    }}>
                      {game.title}
                    </span>
                    <span style={{
                      fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                      color: 'var(--db-text-muted)', display: 'block', marginTop: 3,
                    }}>
                      {done ? game.desc : game.desc}
                    </span>
                  </div>

                  {/* Right side: reward or result */}
                  <div style={{ flexShrink: 0, textAlign: 'right' }}>
                    {done ? (
                      <>
                        <span style={{
                          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
                          color: 'var(--db-success)', display: 'block', lineHeight: 1,
                        }}>
                          +{dobsEarned}
                        </span>
                        <span style={{
                          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                          color: 'var(--db-text-ghost)', display: 'block', marginTop: 2,
                        }}>
                          DOBS
                        </span>
                      </>
                    ) : (
                      <>
                        <span style={{
                          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                          color: 'var(--db-primary)', fontWeight: 'var(--db-weight-bold)',
                          display: 'block',
                        }}>
                          {game.reward}
                        </span>
                        <span style={{
                          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                          color: 'var(--db-text-ghost)', display: 'block', marginTop: 2,
                        }}>
                          PLAY →
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* Total earned today */}
      {completedCount > 0 && (
        <div style={{
          margin: '20px 20px 0', padding: '14px 18px', borderRadius: 12,
          background: completedCount === 3 ? 'rgba(34,197,94,0.06)' : 'rgba(255,107,53,0.06)',
          border: `1px solid ${completedCount === 3 ? 'rgba(34,197,94,0.2)' : 'rgba(255,107,53,0.15)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}
        className={completedCount === 3 ? 'dash-complete-glow' : undefined}
        >
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
            color: completedCount === 3 ? 'var(--db-success)' : 'var(--db-text-muted)',
          }}>
            {completedCount === 3 ? 'All games complete!' : `${completedCount} of 3 games played`}
          </span>
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
            color: completedCount === 3 ? 'var(--db-success)' : 'var(--db-primary)',
          }}>
            +{totalDobsEarned} ◈
          </span>
        </div>
      )}
    </main>
  )
}
