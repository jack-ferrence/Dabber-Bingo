import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.js'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticSelection } from '../lib/haptics.js'
import FeaturedBanner from '../components/home/FeaturedBanner.jsx'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, hexToRgba } from '../constants/teamColors.js'

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const ACTIVITIES = [
  {
    key: 'picks',
    label: 'Daily Pick',
    desc: 'Up to 20 Dobs',
    path: '/daily/picks',
    field: 'picks_completed',
    dobsField: 'picks_dobs_earned',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.5 12.5L11 15L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    key: 'trivia',
    label: 'Trivia',
    desc: '5 Dobs',
    path: '/daily/trivia',
    field: 'trivia_completed',
    dobsField: 'trivia_dobs_earned',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
        <text x="12" y="17" textAnchor="middle" fill="currentColor" fontSize="14" fontWeight="700" fontFamily="var(--db-font-display)">?</text>
      </svg>
    ),
  },
  {
    key: 'games',
    label: 'Mini Games',
    desc: 'Up to 100+ Dobs',
    path: '/daily/games',
    // "done" when all 3 mini-games are complete
    field: '_games_composite',
    dobsField: '_games_composite_dobs',
    icon: (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeWidth="1.5" />
        <text x="12" y="17" textAnchor="middle" fill="currentColor" fontSize="13" fontWeight="700">🎮</text>
      </svg>
    ),
  },
]

function getTeamColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#475569'
  return NBA_TEAM_COLORS[abbr] ?? '#475569'
}

function parseTeams(name) {
  const parts = (name ?? '').split(' vs ')
  return { away: parts[0]?.trim() || '???', home: parts[1]?.trim() || '???' }
}

function formatGameTime(startsAt) {
  if (!startsAt) return ''
  return new Date(startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatClock(room) {
  if (room.status === 'live') {
    const period = room.game_period ?? 0
    const clock = room.game_clock ?? ''
    const sport = room.sport ?? 'nba'
    if (sport === 'mlb') return period > 0 ? `${period > 9 ? 'Extra' : ''} Inn ${period}` : 'Live'
    if (sport === 'nhl') return period > 0 ? `P${period} ${clock}` : 'Live'
    return period > 0 ? `Q${period} ${clock}` : 'Live'
  }
  return formatGameTime(room.starts_at)
}

export default function HomePage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { dobsBalance } = useProfile()
  const { activity, streak, loading, multiplier } = useDailyActivity()

  // Fetch user's active games + rank
  const [myGames, setMyGames] = useState([])
  const [myRank, setMyRank] = useState(null)
  const [dataLoading, setDataLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadExtra() {
      if (!user) { setMyGames([]); setMyRank(null); setDataLoading(false); return }

      const [participantsRes, roomsRes, rankRes] = await Promise.all([
        supabase.from('room_participants').select('room_id').eq('user_id', user.id),
        supabase
          .from('rooms_with_counts')
          .select('*')
          .in('status', ['lobby', 'live'])
          .order('starts_at', { ascending: true }),
        supabase
          .from('all_time_leaderboard')
          .select('user_id, username, total_dobs_earned, rank')
          .eq('user_id', user.id)
          .maybeSingle(),
      ])

      if (cancelled) return

      if (rankRes.data) setMyRank(rankRes.data)

      const joined = new Set((participantsRes.data ?? []).map((p) => p.room_id))
      const myRooms = (roomsRes.data ?? []).filter((r) => joined.has(r.id))

      if (myRooms.length > 0) {
        const { data: cards } = await supabase
          .from('cards')
          .select('room_id, squares_marked')
          .eq('user_id', user.id)
          .in('room_id', myRooms.map((r) => r.id))

        if (cancelled) return

        const cardMap = {}
        for (const c of cards ?? []) cardMap[c.room_id] = c

        setMyGames(
          myRooms.slice(0, 3).map((r) => ({
            ...r,
            squares_marked: cardMap[r.id]?.squares_marked ?? 0,
          }))
        )
      }

      setDataLoading(false)
    }

    loadExtra()
    return () => { cancelled = true }
  }, [user])

  const gamesAllDone = activity
    ? (activity.derby_completed && activity.passer_completed && activity.flick_completed)
    : false
  const gamesSomeDone = activity
    ? (activity.derby_completed || activity.passer_completed || activity.flick_completed)
    : false
  const gamesCount = activity
    ? [activity.derby_completed, activity.passer_completed, activity.flick_completed].filter(Boolean).length
    : 0
  const completedCount = activity
    ? [activity.picks_completed, activity.trivia_completed, activity.derby_completed, activity.passer_completed, activity.flick_completed].filter(Boolean).length
    : 0

  const allComplete = completedCount === 5
  const currentStreak = streak?.current_streak ?? 0

  // Build streak day visualization
  const today = new Date()
  const todayDow = today.getDay() // 0=Sun
  const streakDays = []
  for (let i = 0; i < 7; i++) {
    const daysSinceMonday = (todayDow + 6) % 7 // 0=Mon
    const offset = i - daysSinceMonday
    const isToday = offset === 0
    const isPast = offset < 0
    const isFuture = offset > 0
    // If streak covers this past day, it's "completed"
    const completed = isPast && currentStreak > Math.abs(offset) - 1
    const todayCompleted = isToday && allComplete
    streakDays.push({
      label: DAY_LABELS[(1 + i) % 7], // M T W T F S S
      isToday,
      isPast,
      isFuture,
      completed: completed || todayCompleted,
    })
  }

  // Loading skeleton
  if (loading && dataLoading) {
    return (
      <main className="page-enter" style={{ paddingBottom: 100, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px' }}>
          <div style={{ height: 28, width: 80, borderRadius: 6, background: 'var(--db-bg-elevated)', marginBottom: 20 }} />
          <div style={{ height: 110, borderRadius: 14, background: 'var(--db-bg-elevated)', marginBottom: 16, animation: 'pulse 1.8s ease-in-out infinite' }} />
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{ flex: 1, height: 90, borderRadius: 12, background: 'var(--db-bg-elevated)', animation: 'pulse 1.8s ease-in-out infinite', animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          {[1, 2].map((i) => (
            <div key={i} style={{ height: 68, borderRadius: 12, marginBottom: 10, background: 'var(--db-bg-elevated)', animation: 'pulse 1.8s ease-in-out infinite' }} />
          ))}
        </div>
      </main>
    )
  }

  return (
    <main className="page-enter" style={{ paddingBottom: 100, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ padding: '20px 20px 0' }}>

        {/* ════ DAILY STREAK ════ */}
        <div style={{
          padding: '18px 20px', borderRadius: 14,
          background: 'var(--db-bg-surface)',
          border: '1px solid var(--db-border-subtle)',
          marginBottom: 20,
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Subtle gradient accent along top */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 2,
            background: currentStreak > 0
              ? 'linear-gradient(90deg, var(--db-primary), rgba(255,107,53,0.3))'
              : 'var(--db-border-subtle)',
          }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
            <div>
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
                display: 'block', marginBottom: 6,
              }}>DAILY STREAK</span>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                <span style={{
                  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
                  color: currentStreak > 0 ? 'var(--db-text-bright)' : 'var(--db-text-ghost)',
                  lineHeight: 0.85,
                }}>
                  {currentStreak}
                </span>
                <span style={{
                  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
                  color: 'var(--db-text-muted)', lineHeight: 1,
                }}>
                  {currentStreak === 1 ? 'day' : 'days'}
                </span>
                {currentStreak >= 3 && (
                  <span style={{ fontSize: 18, marginLeft: 2 }}>🔥</span>
                )}
              </div>
            </div>

            {/* Multiplier / Bonus badge */}
            {multiplier > 1 ? (
              <div className="streak-pulse" style={{
                padding: '6px 12px', borderRadius: 8,
                background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.25)',
              }}>
                <span style={{
                  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
                  color: 'var(--db-primary)', letterSpacing: 'var(--db-tracking-wide)',
                }}>
                  {multiplier}x
                </span>
              </div>
            ) : currentStreak > 0 ? (
              <div style={{
                padding: '6px 12px', borderRadius: 8,
                background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.15)',
              }}>
                <span style={{
                  fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                  color: 'var(--db-primary)', fontWeight: 'var(--db-weight-bold)',
                  letterSpacing: 'var(--db-tracking-wide)',
                }}>
                  +5 DOBS
                </span>
              </div>
            ) : null}
          </div>

          {/* Week day circles */}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {streakDays.map((day, i) => {
              const filled = day.completed
              const isToday = day.isToday
              return (
                <div key={i} style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, flex: 1,
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: filled
                      ? 'var(--db-primary)'
                      : isToday
                        ? 'rgba(255,107,53,0.15)'
                        : 'var(--db-bg-elevated)',
                    border: isToday && !filled
                      ? '2px solid var(--db-primary)'
                      : filled
                        ? '2px solid var(--db-primary)'
                        : '2px solid transparent',
                    transition: 'all 200ms ease',
                    boxShadow: filled ? '0 0 10px rgba(255,107,53,0.3)' : 'none',
                  }}>
                    {filled ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M3 7.5L5.5 10L11 4" stroke="#0c0c14" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <span style={{
                        fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                        fontWeight: 'var(--db-weight-bold)',
                        color: isToday ? 'var(--db-primary)' : 'var(--db-text-ghost)',
                      }}>
                        {day.label}
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ════ STREAK EXPLANATION ════ */}
        {!allComplete && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 10,
            background: 'var(--db-bg-surface)',
            border: '1px solid var(--db-border-subtle)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>💡</span>
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
              color: 'var(--db-text-muted)', lineHeight: 1.5,
            }}>
              Complete all daily activities — picks, trivia, and all 3 mini games — to keep your streak going and earn the completion bonus.
            </span>
          </div>
        )}

        {/* ════ EARN DOBS — grid tiles ════ */}
        <div style={{ marginBottom: 20 }}>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
            letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-ghost)',
            display: 'block', marginBottom: 10,
          }}>EARN DOBS</span>

          <div className="activity-stagger" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {ACTIVITIES.map((act) => {
              // Composite "games" tile: done only when all 3 games complete
              const isGamesTile = act.key === 'games'
              const done = isGamesTile ? gamesAllDone : (activity?.[act.field] ?? false)
              const partial = isGamesTile && gamesSomeDone && !gamesAllDone
              const statusLabel = isGamesTile
                ? (gamesAllDone ? 'DONE' : gamesSomeDone ? `${gamesCount}/3` : 'PLAY')
                : (done ? 'DONE' : 'READY')

              return (
                <button
                  key={act.key}
                  type="button"
                  className="daily-btn btn-press"
                  aria-label={`${act.label} — ${done ? 'completed' : act.desc}`}
                  onClick={() => { hapticSelection(); navigate(act.path) }}
                  style={{
                    padding: '14px 8px 12px', borderRadius: 12,
                    background: done ? 'rgba(34,197,94,0.06)' : 'var(--db-bg-surface)',
                    border: done
                      ? '1.5px solid rgba(34,197,94,0.25)'
                      : partial
                        ? '1.5px solid rgba(255,107,53,0.5)'
                        : '1.5px solid var(--db-primary)',
                    cursor: 'pointer', textAlign: 'center',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    transition: 'all 150ms ease',
                  }}
                >
                  <div style={{
                    color: done ? 'var(--db-success)' : 'var(--db-primary)',
                    opacity: done ? 0.6 : 1,
                  }}>
                    {done ? (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="9.5" fill="rgba(34,197,94,0.15)" stroke="currentColor" strokeWidth="1.5" />
                        <path d="M8.5 12.5L11 15L16 9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : act.icon}
                  </div>
                  <span style={{
                    fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
                    letterSpacing: 'var(--db-tracking-wide)',
                    color: done ? 'var(--db-text-muted)' : 'var(--db-text-primary)',
                    lineHeight: 'var(--db-leading-tight)',
                  }}>
                    {act.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                    color: done ? 'var(--db-success)' : partial ? 'var(--db-primary)' : 'var(--db-primary)',
                    fontWeight: 'var(--db-weight-semibold)',
                  }}>
                    {statusLabel}
                  </span>
                </button>
              )
            })}
          </div>

          {/* All complete banner */}
          {allComplete && (
            <div className="banner-celebrate" style={{
              marginTop: 10, padding: '10px 14px', borderRadius: 10,
              background: 'linear-gradient(135deg, rgba(255,107,53,0.10) 0%, rgba(34,197,94,0.08) 100%)',
              border: '1px solid rgba(255,107,53,0.25)',
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
                  fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                  color: 'var(--db-text-secondary)', display: 'block', marginTop: 4,
                }}>
                  +30 ◈ completion bonus earned!
                </span>
              )}
            </div>
          )}
        </div>

        {/* ════ YOUR GAMES ════ */}
        {myGames.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
              letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-ghost)',
              display: 'block', marginBottom: 10,
            }}>YOUR GAMES</span>

            <div className="pick-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {myGames.map((room) => {
                const isLive = room.status === 'live'
                const sport = room.sport ?? 'nba'
                const { away, home } = parseTeams(room.name)
                const awayColor = getTeamColor(away, sport)
                const homeColor = getTeamColor(home, sport)
                const clock = formatClock(room)
                const marked = room.squares_marked ?? 0

                return (
                  <button
                    key={room.id}
                    type="button"
                    className="daily-btn btn-press"
                    onClick={() => { hapticSelection(); navigate(`/room/${room.id}`) }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '0', borderRadius: 12,
                      background: `linear-gradient(135deg, ${hexToRgba(awayColor, 0.12)} 0%, var(--db-bg-surface) 45%, ${hexToRgba(homeColor, 0.12)} 100%)`,
                      border: isLive
                        ? '1px solid rgba(255,45,45,0.2)'
                        : '1px solid var(--db-border-subtle)',
                      cursor: 'pointer', textAlign: 'left', width: '100%',
                      transition: 'all 150ms ease',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    {/* Top accent bar with team colors */}
                    <div style={{
                      position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                      background: `linear-gradient(90deg, ${awayColor}, ${homeColor})`,
                      opacity: isLive ? 0.8 : 0.5,
                    }} />
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 14,
                      padding: '16px 16px 14px', width: '100%',
                    }}>
                    {/* Left: game info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{
                        fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
                        letterSpacing: 'var(--db-tracking-wide)',
                        color: 'var(--db-text-primary)', display: 'block',
                        lineHeight: 'var(--db-leading-tight)',
                      }}>
                        {room.name}
                      </span>
                      <span style={{
                        fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                        color: 'var(--db-text-muted)', marginTop: 2, display: 'block',
                      }}>
                        {sport.toUpperCase()} · {clock}
                      </span>
                    </div>

                    {/* Right: status */}
                    <div style={{ flexShrink: 0, textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                      {isLive ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                            fontWeight: 'var(--db-weight-bold)', color: 'var(--db-live)',
                            letterSpacing: 'var(--db-tracking-wide)',
                          }}>
                            <span style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: 'var(--db-live)',
                              animation: 'pulse-live 1.5s ease-in-out infinite',
                            }} />
                            LIVE
                          </span>
                          <span style={{
                            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
                            color: 'var(--db-text-bright)', lineHeight: 1,
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {marked}
                          </span>
                          <span style={{
                            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                            color: 'var(--db-text-ghost)',
                          }}>marked</span>
                        </div>
                      ) : (
                        <div>
                          <span style={{
                            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                            color: 'var(--db-text-ghost)',
                          }}>Upcoming</span>
                          <span style={{
                            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                            color: 'var(--db-text-ghost)', display: 'block', marginTop: 1,
                          }}>card ready</span>
                        </div>
                      )}
                    </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* ════ FEATURED ════ */}
      </div>

      <FeaturedBanner />

      <div style={{ padding: '0 20px' }}>

        {/* ════ YOUR STANDING ════ */}
        <div style={{ marginTop: 20, marginBottom: 8 }}>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
            letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-ghost)',
            display: 'block', marginBottom: 10,
          }}>STANDINGS</span>

          <button
            type="button"
            className="daily-btn btn-press"
            onClick={() => { hapticSelection(); navigate('/rank') }}
            style={{
              width: '100%', padding: '18px 20px', borderRadius: 14,
              background: 'var(--db-bg-surface)',
              border: '1px solid var(--db-border-subtle)',
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              transition: 'all 150ms ease',
            }}
          >
            <div>
              <span style={{
                fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
                color: 'var(--db-text-bright)', lineHeight: 0.9, display: 'block',
              }}>
                #{myRank?.rank ?? '—'}
              </span>
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                color: 'var(--db-text-muted)', marginTop: 4, display: 'block',
              }}>
                Season standings
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{
                fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
                color: 'var(--db-primary)', display: 'block', lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {dobsBalance !== null ? dobsBalance.toLocaleString() : '—'} <span style={{ fontSize: 'var(--db-text-md)' }}>◈</span>
              </span>
              {myRank?.rank && (
                <span style={{
                  fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                  color: 'var(--db-success)', display: 'block', marginTop: 4,
                }}>
                  View standings →
                </span>
              )}
            </div>
          </button>
        </div>
      </div>
    </main>
  )
}
