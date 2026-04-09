import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.js'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticSelection } from '../lib/haptics.js'
import FeaturedBanner from '../components/home/FeaturedBanner.jsx'

const ACTIVITIES = [
  {
    key: 'picks',
    label: 'DAILY PICKS',
    desc: 'Pick 3 winners',
    path: '/daily/picks',
    dobs: '5 per pick',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 14.5L13 17.5L18.5 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    field: 'picks_completed',
    dobsField: 'picks_dobs_earned',
  },
  {
    key: 'trivia',
    label: 'TRIVIA',
    desc: '3 questions',
    path: '/daily/trivia',
    dobs: '5 per correct',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.5" />
        <text x="14" y="19" textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="700" fontFamily="var(--db-font-display)">?</text>
      </svg>
    ),
    field: 'trivia_completed',
    dobsField: 'trivia_dobs_earned',
  },
  {
    key: 'game',
    label: 'STREAK SHOT',
    desc: 'Basketball shootout',
    path: '/daily/game',
    dobs: '1 per make',
    icon: (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="11" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="14" r="5" stroke="currentColor" strokeWidth="1.2" />
        <line x1="14" y1="3" x2="14" y2="25" stroke="currentColor" strokeWidth="1" />
        <line x1="3" y1="14" x2="25" y2="14" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
    field: 'game_completed',
    dobsField: 'game_dobs_earned',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { dobsBalance, username } = useProfile()
  const { activity, streak, loading, multiplier } = useDailyActivity()

  const completedCount = activity
    ? [activity.picks_completed, activity.trivia_completed, activity.game_completed].filter(Boolean).length
    : 0

  const allComplete = completedCount === 3
  const currentStreak = streak?.current_streak ?? 0

  return (
    <main style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
      {/* ── Header ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <h1 style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
          fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
          color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)', margin: 0,
        }}>
          HOME
        </h1>
        {username && (
          <p style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
            color: 'var(--db-text-muted)', marginTop: 4,
          }}>
            Welcome back, {username}
          </p>
        )}
      </div>

      {/* ── Dobs Balance + Streak ── */}
      <div style={{ padding: '16px 20px 0', display: 'flex', gap: 12 }}>
        {/* Balance card */}
        <div style={{
          flex: 1, padding: '16px', borderRadius: 12,
          background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
        }}>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
            letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
            display: 'block', marginBottom: 6,
          }}>DOBS BALANCE</span>
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-2xl)',
            color: 'var(--db-primary)', lineHeight: 1,
          }}>
            {dobsBalance !== null ? dobsBalance.toLocaleString() : '—'} <span style={{ fontSize: 'var(--db-text-lg)' }}>◈</span>
          </span>
        </div>

        {/* Streak card */}
        <div style={{
          width: 120, padding: '16px', borderRadius: 12,
          background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
          textAlign: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
            letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
            display: 'block', marginBottom: 6,
          }}>STREAK</span>
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-2xl)',
            color: currentStreak > 0 ? 'var(--db-primary)' : 'var(--db-text-ghost)',
            lineHeight: 1, display: 'block',
          }}>
            {currentStreak}
          </span>
          {multiplier > 1 && (
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
              color: 'var(--db-success)', fontWeight: 'var(--db-weight-bold)',
              marginTop: 4, display: 'block',
            }}>
              {multiplier}x BONUS
            </span>
          )}
        </div>
      </div>

      {/* ── Daily Progress ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
              letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
            }}>TODAY'S ACTIVITIES</span>
          </div>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
            fontWeight: 'var(--db-weight-bold)',
            color: allComplete ? 'var(--db-success)' : 'var(--db-text-secondary)',
          }}>
            {completedCount}/3
          </span>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i < completedCount ? 'var(--db-primary)' : 'var(--db-bg-active)',
              transition: 'background 300ms ease',
            }} />
          ))}
        </div>

        {/* Activity cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ACTIVITIES.map((act) => {
            const done = activity?.[act.field] ?? false
            const dobsEarned = activity?.[act.dobsField] ?? 0

            return (
              <button
                key={act.key}
                type="button"
                onClick={() => { hapticSelection(); navigate(act.path) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px', borderRadius: 12,
                  background: done ? 'rgba(34,197,94,0.06)' : 'var(--db-bg-surface)',
                  border: `1px solid ${done ? 'rgba(34,197,94,0.2)' : 'var(--db-border-subtle)'}`,
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  transition: 'all 150ms ease',
                }}
              >
                {/* Icon */}
                <div style={{
                  color: done ? 'var(--db-success)' : 'var(--db-primary)',
                  flexShrink: 0, opacity: done ? 0.7 : 1,
                }}>
                  {done ? (
                    <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                      <circle cx="14" cy="14" r="11" fill="rgba(34,197,94,0.15)" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M10 14.5L13 17.5L18.5 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : act.icon}
                </div>

                {/* Text */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
                    letterSpacing: 'var(--db-tracking-wide)',
                    color: done ? 'var(--db-success)' : 'var(--db-text-primary)',
                    display: 'block',
                  }}>
                    {act.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                    color: 'var(--db-text-muted)',
                  }}>
                    {done ? `Earned ${dobsEarned} ◈` : act.desc}
                  </span>
                </div>

                {/* Right side */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  {done ? (
                    <span style={{
                      fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
                      fontWeight: 'var(--db-weight-bold)', color: 'var(--db-success)',
                    }}>
                      +{dobsEarned} ◈
                    </span>
                  ) : (
                    <span style={{
                      fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                      color: 'var(--db-primary)', fontWeight: 'var(--db-weight-semibold)',
                    }}>
                      {act.dobs} →
                    </span>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* All-three bonus indicator */}
        {allComplete && (
          <div style={{
            marginTop: 12, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.2)',
            textAlign: 'center',
          }}>
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
              letterSpacing: 'var(--db-tracking-wide)', color: 'var(--db-primary)',
            }}>
              ALL ACTIVITIES COMPLETE
            </span>
            {activity?.all_three_bonus_awarded && (
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                color: 'var(--db-text-secondary)', display: 'block', marginTop: 4,
              }}>
                +30 ◈ completion bonus earned!
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Featured Banner ── */}
      <FeaturedBanner />

      {/* ── Loading skeleton ── */}
      {loading && (
        <div style={{ padding: '20px' }}>
          {[1, 2, 3].map((i) => (
            <div key={i} style={{
              height: 72, borderRadius: 12, marginBottom: 10,
              background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-subtle)',
              animation: 'pulse 1.8s ease-in-out infinite',
            }} />
          ))}
        </div>
      )}
    </main>
  )
}
