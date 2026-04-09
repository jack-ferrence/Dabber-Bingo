import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useDailyPicks } from '../hooks/useDailyPicks.js'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticSelection, hapticMedium } from '../lib/haptics.js'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, hexToRgba } from '../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#475569'
  return NBA_TEAM_COLORS[abbr] ?? '#475569'
}

function parseTeams(name) {
  const parts = (name ?? '').split(' vs ')
  return { away: parts[0]?.trim() || '???', home: parts[1]?.trim() || '???' }
}

function formatTime(startsAt) {
  if (!startsAt) return ''
  return new Date(startsAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function tomorrowDateStr() {
  const d = new Date(Date.now() + 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DailyPicksPage() {
  const { user } = useAuth()
  const { games, userPicks, yesterdayPicks, loading, reload } = useDailyPicks()
  const { activity, reload: reloadActivity } = useDailyActivity()
  const [selections, setSelections] = useState({}) // roomId → teamAbbr
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const alreadyPicked = userPicks.length > 0 || activity?.picks_completed

  const handleSelect = (roomId, team) => {
    if (alreadyPicked || submitting) return
    hapticSelection()
    setSelections((prev) => ({ ...prev, [roomId]: team }))
  }

  const allSelected = games.length > 0 && games.every((g) => selections[g.id])

  const handleSubmit = async () => {
    if (!allSelected || submitting || !user) return
    hapticMedium()
    setSubmitting(true)

    const tomorrow = tomorrowDateStr()
    const picks = games.map((g) => {
      const { away, home } = parseTeams(g.name)
      const picked = selections[g.id]
      return {
        user_id: user.id,
        pick_date: tomorrow,
        room_id: g.id,
        picked_team: picked,
        picked_team_display: picked,
      }
    })

    const { error } = await supabase.from('daily_picks').insert(picks)
    if (error) {
      console.error('Failed to submit picks:', error)
      setSubmitting(false)
      return
    }

    // Mark picks activity complete — 0 dobs now, awarded when games resolve
    await supabase.rpc('complete_daily_activity', {
      p_user_id: user.id,
      p_activity: 'picks',
      p_dobs_earned: 0,
    })

    setSubmitted(true)
    setSubmitting(false)
    reload()
    reloadActivity()
  }

  const handleLockIn = () => {
    if (confirming) {
      handleSubmit()
    } else {
      hapticSelection()
      setConfirming(true)
      setTimeout(() => setConfirming(false), 3000)
    }
  }

  return (
    <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
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
          DAILY PICKS
        </h1>
        <p style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
          color: 'var(--db-text-muted)', margin: 0,
        }}>
          {alreadyPicked
            ? 'Your picks are locked in. Results after games finish.'
            : 'Pick the winner for each game. 5 ◈ per correct pick.'}
        </p>
      </div>

      {/* Yesterday's Results */}
      {yesterdayPicks.length > 0 && (
        <div style={{ padding: '16px 20px 0' }}>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
            letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
            display: 'block', marginBottom: 10,
          }}>YESTERDAY'S RESULTS</span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {yesterdayPicks.map((pick) => {
              const room = pick.rooms
              const { away, home } = parseTeams(room?.name)
              const isCorrect = pick.is_correct
              const pending = isCorrect === null

              return (
                <div key={pick.id} style={{
                  padding: '12px 14px', borderRadius: 10,
                  background: pending ? 'var(--db-bg-surface)' : isCorrect ? 'rgba(34,197,94,0.06)' : 'rgba(255,45,45,0.06)',
                  border: `1px solid ${pending ? 'var(--db-border-subtle)' : isCorrect ? 'rgba(34,197,94,0.2)' : 'rgba(255,45,45,0.2)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <span style={{
                      fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
                      color: 'var(--db-text-primary)',
                    }}>
                      {away} vs {home}
                    </span>
                    <span style={{
                      fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                      color: 'var(--db-text-muted)', display: 'block', marginTop: 2,
                    }}>
                      Picked: {pick.picked_team_display}
                      {room?.home_score != null && ` · ${room.away_score}–${room.home_score}`}
                    </span>
                  </div>
                  <span style={{
                    fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
                    color: pending ? 'var(--db-text-ghost)' : isCorrect ? 'var(--db-success)' : 'var(--db-live)',
                  }}>
                    {pending ? '⏳' : isCorrect ? '✓ +5 ◈' : '✗'}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Tomorrow's Games */}
      <div style={{ padding: '20px 20px 0' }}>
        <span style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
          letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
          display: 'block', marginBottom: 12,
        }}>TOMORROW'S MATCHUPS</span>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 100, borderRadius: 14, background: 'var(--db-bg-elevated)',
                border: '1px solid var(--db-border-subtle)',
                animation: 'pulse 1.8s ease-in-out infinite',
              }} />
            ))}
          </div>
        )}

        {!loading && games.length === 0 && (
          <div style={{
            padding: '40px 20px', textAlign: 'center', borderRadius: 14,
            background: 'var(--db-bg-surface)', border: '1px dashed var(--db-border-default)',
          }}>
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
              color: 'var(--db-text-muted)',
            }}>
              No games scheduled for tomorrow yet. Check back later!
            </span>
          </div>
        )}

        {!loading && games.length > 0 && (
          <div className="pick-stagger" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {games.map((game) => {
              const { away, home } = parseTeams(game.name)
              const sport = game.sport ?? 'nba'
              const awayColor = getTeamColor(away, sport)
              const homeColor = getTeamColor(home, sport)
              const selected = selections[game.id]
              const lockedPick = userPicks.find((p) => p.room_id === game.id)

              return (
                <div key={game.id} style={{
                  borderRadius: 14, overflow: 'hidden',
                  background: `linear-gradient(145deg, ${hexToRgba(awayColor, 0.15)} 0%, var(--db-bg-surface) 50%, ${hexToRgba(homeColor, 0.15)} 100%)`,
                  border: '1px solid var(--db-border-subtle)',
                }}>
                  {/* Top accent */}
                  <div style={{
                    height: 3,
                    background: `linear-gradient(to right, ${awayColor}, ${homeColor})`,
                    opacity: 0.6,
                  }} />

                  <div style={{ padding: '14px 16px' }}>
                    {/* Time + Sport */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      marginBottom: 12,
                    }}>
                      <span style={{
                        fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                        color: 'var(--db-text-muted)',
                      }}>
                        {formatTime(game.starts_at)} · {sport.toUpperCase()}
                      </span>
                      {(selected || lockedPick) && (
                        <span style={{
                          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                          fontWeight: 'var(--db-weight-bold)',
                          color: lockedPick ? 'var(--db-success)' : 'var(--db-primary)',
                          background: lockedPick ? 'rgba(34,197,94,0.1)' : 'rgba(255,107,53,0.1)',
                          padding: '2px 8px', borderRadius: 4,
                        }}>
                          {lockedPick ? '✓ LOCKED' : 'SELECTED'}
                        </span>
                      )}
                    </div>

                    {/* Team buttons */}
                    <div style={{ display: 'flex', gap: 10 }}>
                      {[away, home].map((team, idx) => {
                        const teamColor = idx === 0 ? awayColor : homeColor
                        const isPicked = lockedPick ? lockedPick.picked_team === team : selected === team
                        const isDisabled = !!lockedPick

                        return (
                          <button
                            key={team}
                            type="button"
                            className="daily-btn btn-press"
                            disabled={isDisabled}
                            aria-label={`Pick ${team} ${idx === 0 ? 'away' : 'home'}${isPicked ? ' (selected)' : ''}`}
                            aria-pressed={isPicked}
                            onClick={() => handleSelect(game.id, team)}
                            style={{
                              flex: 1, padding: '14px 8px', borderRadius: 10,
                              background: isPicked
                                ? `linear-gradient(180deg, ${hexToRgba(teamColor, 0.25)} 0%, ${hexToRgba(teamColor, 0.12)} 100%)`
                                : 'var(--db-bg-elevated)',
                              border: `2px solid ${isPicked ? teamColor : 'var(--db-border-subtle)'}`,
                              boxShadow: isPicked ? `0 0 12px ${hexToRgba(teamColor, 0.3)}, inset 0 1px 0 ${hexToRgba(teamColor, 0.2)}` : 'none',
                              cursor: isDisabled ? 'default' : 'pointer',
                              transition: 'all 150ms ease',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                            }}
                          >
                            <span style={{
                              fontFamily: 'var(--db-font-display)',
                              fontSize: 'var(--db-text-xl)',
                              fontWeight: 'var(--db-weight-extrabold)',
                              color: isPicked ? 'var(--db-text-bright)' : 'var(--db-text-secondary)',
                              lineHeight: 1,
                            }}>
                              {team}
                            </span>
                            <span style={{
                              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                              color: isPicked ? teamColor : 'var(--db-text-ghost)',
                              textTransform: 'uppercase',
                            }}>
                              {idx === 0 ? 'Away' : 'Home'}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Submit button */}
      {!alreadyPicked && !submitted && games.length > 0 && (
        <div style={{ padding: '20px 20px 0' }}>
          <button
            type="button"
            className="daily-btn"
            onClick={handleLockIn}
            disabled={!allSelected || submitting}
            style={{
              width: '100%', padding: '16px', borderRadius: 10, border: 'none',
              background: confirming
                ? 'linear-gradient(135deg, var(--db-live) 0%, var(--db-primary-dark) 100%)'
                : allSelected && !submitting ? 'var(--db-gradient-primary)' : 'var(--db-bg-elevated)',
              color: allSelected && !submitting ? '#fff' : 'var(--db-text-ghost)',
              fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
              fontWeight: 'var(--db-weight-extrabold)', letterSpacing: 'var(--db-tracking-wide)',
              cursor: allSelected && !submitting ? 'pointer' : 'not-allowed',
              boxShadow: confirming
                ? '0 4px 20px rgba(255,45,45,0.4)'
                : allSelected ? '0 4px 16px rgba(255,107,53,0.3)' : 'none',
              transition: 'all 200ms ease',
            }}
          >
            {submitting ? 'LOCKING IN...' : confirming ? 'TAP AGAIN TO CONFIRM' : allSelected ? 'LOCK IN PICKS' : `SELECT ALL ${games.length} WINNERS`}
          </button>
        </div>
      )}

      {/* Submitted confirmation */}
      {(alreadyPicked || submitted) && (
        <div className="celebrate-pop" style={{
          margin: '20px 20px 0', padding: '16px', borderRadius: 10,
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
          textAlign: 'center',
        }}>
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
            letterSpacing: 'var(--db-tracking-wide)', color: 'var(--db-success)',
          }}>
            PICKS LOCKED IN
          </span>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
            color: 'var(--db-text-muted)', display: 'block', marginTop: 4,
          }}>
            Results will appear after games finish. 5 ◈ per correct pick!
          </span>
        </div>
      )}
    </main>
  )
}
