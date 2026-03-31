import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useHomeData } from '../hooks/useHomeData.js'
import { useCountdown } from '../hooks/useCountdown.js'
import { supabase } from '../lib/supabase'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, hexToRgba } from '../constants/teamColors.js'
import SportSection from '../components/home/SportSection.jsx'
import TopPlayers from '../components/home/TopPlayers.jsx'
import FeaturedBanner from '../components/home/FeaturedBanner.jsx'

function ordinal(n) {
  if (n <= 0) return ''
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return '#' + n + (s[(v - 20) % 10] || s[v] || s[0])
}

function getTeamColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? MLB_TEAM_COLORS.DEFAULT
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? NCAA_TEAM_COLORS.DEFAULT
  return NBA_TEAM_COLORS[abbr] ?? NBA_TEAM_COLORS.DEFAULT
}

function isTomorrow(dateStr) {
  if (!dateStr) return false
  const gameDate = new Date(dateStr)
  const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  const gameStr = gameDate.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
  return gameStr > todayStr
}

function GameCountdown({ date }) {
  const { total, minutes, seconds, isExpired } = useCountdown(date)

  if (!date || isExpired) {
    return (
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.06em', color: '#ff6b35' }}>STARTING SOON</span>
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, color: 'rgba(255,107,53,0.6)', marginTop: 2 }}>Tap to play →</p>
      </div>
    )
  }

  if (total < 60 * 60 * 1000) {
    return (
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 700, color: '#e8e8f4', letterSpacing: '0.04em' }}>
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Tap to play →</p>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'right' }}>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.45)' }}>
        {new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </span>
      <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Tap to play →</p>
    </div>
  )
}

const SPORT_SECTIONS = [
  { sport: 'nba',  label: '🏀 NBA' },
  { sport: 'ncaa', label: '🏆 NCAA' },
  { sport: 'mlb',  label: '⚾ MLB' },
]

export default function LobbyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { allRooms, loading, error } = useHomeData()

  const [activeSport, setActiveSport] = useState('all')
  const [finishedRanks, setFinishedRanks] = useState({})
  const [myRoomIds, setMyRoomIds] = useState(new Set())

  useEffect(() => {
    if (!user) { setMyRoomIds(new Set()); return }
    supabase
      .from('room_participants')
      .select('room_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setMyRoomIds(new Set((data ?? []).map((r) => r.room_id)))
      })
  }, [user, allRooms])

  useEffect(() => {
    if (!user) return
    const finishedRooms = allRooms.filter((r) => r.status === 'finished')
    if (finishedRooms.length === 0) return
    const fetchRanks = async () => {
      const ranks = {}
      for (const room of finishedRooms) {
        const { data: cards } = await supabase
          .from('cards')
          .select('user_id, lines_completed, squares_marked, late_join')
          .eq('room_id', room.id)
          .order('lines_completed', { ascending: false })
          .order('squares_marked', { ascending: false })
        if (cards) {
          const eligible = cards.filter((c) => !c.late_join)
          const rank = eligible.findIndex((c) => c.user_id === user.id) + 1
          if (rank > 0) ranks[room.id] = rank
        }
      }
      setFinishedRanks(ranks)
    }
    fetchRanks()
  }, [allRooms, user])

  const handleOpenGame = (roomId) => {
    if (!user) { navigate('/login'); return }
    navigate(`/room/${roomId}`)
  }

  // Mobile: flat priority-sorted list — live > today > tomorrow > finished (last)
  const mobileSortedGames = useMemo(() => {
    const getPriority = (r) => {
      if (r.status === 'live') return 3
      if (r.status === 'finished') return 0
      if (isTomorrow(r.starts_at)) return 1
      return 2  // today lobby
    }
    return [...allRooms].sort((a, b) => {
      const aPriority = getPriority(a)
      const bPriority = getPriority(b)
      if (bPriority !== aPriority) return bPriority - aPriority
      // Within live: playing games sort before new ones
      if (a.status === 'live' && b.status === 'live') {
        const aPlaying = myRoomIds.has(a.id) ? 1 : 0
        const bPlaying = myRoomIds.has(b.id) ? 1 : 0
        if (bPlaying !== aPlaying) return bPlaying - aPlaying
      }
      const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
      const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
      return aTime - bTime
    })
  }, [allRooms, myRoomIds])

  // Desktop: group by sport, sorted live → today lobby → tomorrow lobby → finished (last)
  const roomsBySport = useMemo(() => {
    const statusRank = (r) => {
      if (r.status === 'live') return 0
      if (r.status === 'finished') return 3
      if (isTomorrow(r.starts_at)) return 2
      return 1  // today lobby
    }
    const groups = Object.fromEntries(SPORT_SECTIONS.map((s) => [s.sport, []]))
    for (const room of allRooms) {
      const sport = room.sport ?? 'nba'
      if (groups[sport]) groups[sport].push(room)
      else groups.nba.push(room)
    }
    for (const sport of Object.keys(groups)) {
      groups[sport].sort((a, b) => {
        const rankDiff = statusRank(a) - statusRank(b)
        if (rankDiff !== 0) return rankDiff
        const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
        const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
        return aTime - bTime
      })
    }
    return groups
  }, [allRooms])

  const filteredMobileGames = useMemo(() => {
    if (activeSport === 'all') return mobileSortedGames
    return mobileSortedGames.filter((r) => (r.sport ?? 'nba') === activeSport)
  }, [mobileSortedGames, activeSport])

  const liveCount = allRooms.filter((r) => r.status === 'live').length

  return (
    <div className="px-4 py-5 md:px-6 md:py-8 max-w-[1200px] mx-auto">
      {/* Page header */}
      <div className="mb-3 md:mb-9">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h1
              className="lobby-title"
              style={{
                fontFamily: 'var(--db-font-display)',
                fontSize: 'clamp(28px, 4vw, 42px)',
                letterSpacing: '0.06em',
                lineHeight: 1,
                color: '#e8e8f4',
              }}
            >
              GAMES
            </h1>
            <p className="hidden md:block mt-1" style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>
              Live bingo powered by real stats
            </p>
          </div>
          {!loading && liveCount > 0 && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                fontFamily: 'var(--db-font-display)',
                fontSize: 14,
                letterSpacing: '0.08em',
                color: '#ff4444',
                background: 'rgba(255,45,45,0.08)',
                border: '1px solid rgba(255,45,45,0.18)',
                padding: '4px 10px',
                borderRadius: 20,
              }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff2d2d', display: 'inline-block', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
              {liveCount} LIVE
            </span>
          )}
        </div>
      </div>

      <FeaturedBanner />

      {/* Sport tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
        {[
          { key: 'all',  label: 'ALL',  icon: null },
          { key: 'nba',  label: 'NBA',  icon: '🏀' },
          { key: 'ncaa', label: 'NCAA', icon: '🏆' },
          { key: 'mlb',  label: 'MLB',  icon: '⚾' },
        ].map((tab) => {
          const isActive = activeSport === tab.key
          const count = tab.key === 'all'
            ? allRooms.filter((r) => r.status === 'live' || r.status === 'lobby').length
            : allRooms.filter((r) => (r.sport ?? 'nba') === tab.key && (r.status === 'live' || r.status === 'lobby')).length
          return (
            <button
              key={tab.key}
              onClick={() => setActiveSport(tab.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 18px', borderRadius: 20, border: isActive ? 'none' : '1px solid rgba(255,255,255,0.08)',
                background: isActive ? 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)' : 'rgba(255,255,255,0.04)',
                color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                fontFamily: 'var(--db-font-display)', fontSize: 14, fontWeight: 400, letterSpacing: '0.06em',
                cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.15s ease, color 0.15s ease',
                boxShadow: isActive ? '0 2px 10px rgba(255,107,53,0.3)' : 'none',
              }}
            >
              {tab.icon && <span style={{ fontSize: 13 }}>{tab.icon}</span>}
              {tab.label}
              {count > 0 && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.08)',
                  color: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                }}>
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Error */}
      {error && (
        <div
          className="mb-6 px-4 py-3"
          style={{ background: 'rgba(255,45,45,0.08)', border: '1px solid rgba(255,45,45,0.25)', borderRadius: 6, fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff2d2d' }}
        >
          {error}
        </div>
      )}

      {/* Top players */}
      <div style={{ marginBottom: 16 }}>
        <TopPlayers />
      </div>

      {/* ── Desktop: sport-grouped sections ── */}
      <div className="hidden md:block space-y-10">
        {SPORT_SECTIONS
          .filter((s) => activeSport === 'all' || s.sport === activeSport)
          .map((section, i) => (
            <div key={section.sport} id={`sport-section-${section.sport}`}>
              <SportSection
                sport={section.sport}
                label={section.label}
                games={roomsBySport[section.sport] ?? []}
                loading={loading}
                onOpenGame={handleOpenGame}
                finishedRanks={finishedRanks}
                myRoomIds={myRoomIds}
                style={{ animationDelay: `${i * 100}ms` }}
              />
            </div>
          ))}
      </div>

      {/* ── Mobile: flat priority-sorted list ── */}
      <div className="block md:hidden">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {liveCount > 0 && (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(255,45,45,0.12)', color: '#ff2d2d', borderRadius: 3 }}>
              {liveCount} LIVE
            </span>
          )}
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>
            {loading ? '…' : `${filteredMobileGames.length} game${filteredMobileGames.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 58, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
            ))}
          </div>
        )}

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredMobileGames.length === 0 ? (
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.45)', padding: '12px 0' }}>
                No games available. Check back later!
              </p>
            ) : filteredMobileGames.reduce((acc, room, i) => {
              const nameParts = (room.name || '').split(' vs ')
              const away = nameParts[0]?.trim() || '?'
              const home = nameParts[1]?.trim() || '?'
              const isLive = room.status === 'live'
              const isFinished = room.status === 'finished'
              const tomorrow = !isLive && !isFinished && isTomorrow(room.starts_at)
              const homeColor = getTeamColor(home, room.sport)
              const awayColor = getTeamColor(away, room.sport)
              const rank = finishedRanks[room.id] ?? 0
              const isPlaying = myRoomIds.has(room.id)
              const group = isLive ? 'live' : isFinished ? 'finished' : tomorrow ? 'tomorrow' : 'today'

              const prevGroup = i > 0 ? (() => {
                const pr = filteredMobileGames[i - 1]
                const pl = pr.status === 'live', pf = pr.status === 'finished'
                const pt = !pl && !pf && isTomorrow(pr.starts_at)
                return pl ? 'live' : pf ? 'finished' : pt ? 'tomorrow' : 'today'
              })() : null

              const LABEL = { live: 'LIVE NOW', finished: 'RECENTLY FINISHED', today: 'COMING UP', tomorrow: 'TOMORROW' }
              const LABEL_COLOR = { live: '#ff4444', finished: 'rgba(255,255,255,0.3)', today: 'rgba(255,255,255,0.45)', tomorrow: 'rgba(255,255,255,0.3)' }

              if (group !== prevGroup) {
                acc.push(
                  <div key={`label-${room.id}`} style={{
                    fontFamily: 'var(--db-font-display)', fontSize: 13,
                    color: LABEL_COLOR[group], letterSpacing: '0.1em',
                    padding: i === 0 ? '0 0 4px' : '10px 0 4px',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {group === 'live' && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff2d2d', display: 'inline-block', animation: 'pulse-live 1.4s ease-in-out infinite', flexShrink: 0 }} />}
                    {LABEL[group]}
                  </div>
                )
              }

              acc.push(
                <div
                  key={room.id}
                  onClick={() => tomorrow ? null : handleOpenGame(room.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '14px 16px',
                    position: 'relative', overflow: 'hidden',
                    background: isFinished || tomorrow
                      ? 'rgba(255,255,255,0.02)'
                      : isLive
                        ? 'rgba(255,255,255,0.04)'
                        : isPlaying
                          ? `linear-gradient(135deg, ${hexToRgba(awayColor, 0.14)} 0%, transparent 40%, ${hexToRgba(homeColor, 0.14)} 100%)`
                          : 'rgba(255,255,255,0.03)',
                    borderRadius: 10,
                    border: isLive ? (isPlaying ? '1px solid rgba(255,45,45,0.25)' : '1px solid rgba(255,107,53,0.3)') : isFinished ? '1px solid rgba(255,255,255,0.05)' : tomorrow ? '1px solid rgba(255,255,255,0.04)' : isPlaying ? `1px solid ${hexToRgba(homeColor, 0.22)}` : '1px solid rgba(255,255,255,0.07)',
                    borderLeft: isLive ? (isPlaying ? '3px solid #ff2d2d' : '3px solid #ff6b35') : isFinished ? '3px solid rgba(255,255,255,0.08)' : tomorrow ? '3px solid rgba(255,255,255,0.04)' : isPlaying ? `3px solid ${homeColor}` : '3px solid rgba(255,255,255,0.08)',
                    animation: isLive && !isPlaying ? 'glow-pulse 2s ease-in-out infinite' : 'none',
                    transition: 'opacity 0.2s ease',
                    cursor: tomorrow ? 'default' : 'pointer',
                    opacity: tomorrow ? 0.45 : 1,
                  }}
                >
                  {/* Team color top strip for joined lobby rows */}
                  {isPlaying && !isLive && !isFinished && !tomorrow && (
                    <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(to right, ${awayColor}, ${homeColor})`, borderRadius: '8px 8px 0 0', pointerEvents: 'none' }} />
                  )}
                  {/* Left: medal + teams */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isLive && isPlaying && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 6px rgba(34,197,94,0.5)' }} />
                    )}
                    {isFinished && rank > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 32 }}>
                        <span style={{
                          fontFamily: 'var(--db-font-display)',
                          fontSize: rank <= 3 ? 20 : 15, fontWeight: 800, lineHeight: 1,
                          color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : 'rgba(255,255,255,0.2)',
                        }}>{ordinal(rank)}</span>
                        {rank <= 3 && (
                          <span style={{ fontSize: 10, marginTop: 2 }}>
                            {rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}
                          </span>
                        )}
                      </div>
                    )}
                    <div>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
                        <span style={{
                          fontFamily: 'var(--db-font-display)', fontSize: 20, letterSpacing: '0.04em',
                          color: isFinished ? 'rgba(255,255,255,0.2)' : tomorrow ? 'rgba(255,255,255,0.15)' : awayColor,
                        }}>{away}</span>
                        <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>vs</span>
                        <span style={{
                          fontFamily: 'var(--db-font-display)', fontSize: 20, letterSpacing: '0.04em',
                          color: isFinished ? 'rgba(255,255,255,0.2)' : tomorrow ? 'rgba(255,255,255,0.15)' : homeColor,
                        }}>{home}</span>
                      </div>
                      {room.sport && room.sport !== 'nba' && (
                        <span style={{
                          fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 600,
                          color: room.sport === 'ncaa' ? 'rgba(34,197,94,0.7)' : room.sport === 'mlb' ? 'rgba(255,107,53,0.7)' : 'rgba(255,255,255,0.2)',
                          letterSpacing: '0.06em', textTransform: 'uppercase',
                        }}>
                          {room.sport.toUpperCase()}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: status */}
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    {isLive ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end' }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff2d2d', display: 'inline-block', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
                          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.06em', color: '#ff4444' }}>LIVE</span>
                          {!isPlaying && (
                            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg, #ff7a45, #e05520)', padding: '2px 6px', borderRadius: 4, marginLeft: 2 }}>NEW</span>
                          )}
                        </div>
                        {room.away_score != null && room.home_score != null && (
                          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 15, fontWeight: 700, color: '#e8e8f4', margin: '4px 0 0', fontVariantNumeric: 'tabular-nums' }}>{room.away_score} – {room.home_score}</p>
                        )}
                        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, color: 'rgba(255,107,53,0.7)', marginTop: 3 }}>
                          {isPlaying ? 'Continue →' : 'Tap to play →'}
                        </p>
                      </div>
                    ) : isFinished ? (
                      <div>
                        <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)' }}>FINAL</span>
                        {room.away_score != null && room.home_score != null && (
                          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', margin: '2px 0 0', fontVariantNumeric: 'tabular-nums' }}>{room.away_score} – {room.home_score}</p>
                        )}
                        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>View results →</p>
                      </div>
                    ) : tomorrow ? (
                      <div>
                        <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)' }}>TOMORROW</span>
                        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                          {new Date(room.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>
                          {room.starts_at
                            ? new Date(room.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                            : 'Upcoming'}
                        </span>
                        <div style={{ marginTop: 5, display: 'flex', justifyContent: 'flex-end' }}>
                          {isPlaying ? (
                            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 600, color: '#22c55e', background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 10, padding: '2px 8px' }}>
                              ✓ YOU'RE IN
                            </span>
                          ) : (
                            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>
                              Tap to join
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )

              return acc
            }, [])}
          </div>
        )}
      </div>
    </div>
  )
}
