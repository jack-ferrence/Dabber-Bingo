import { Fragment, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'
import { useHomeData } from '../hooks/useHomeData.js'
import { useCountdown } from '../hooks/useCountdown.js'
import { supabase } from '../lib/supabase'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, hexToRgba } from '../constants/teamColors.js'
import SportSection from '../components/home/SportSection.jsx'
import TopPlayers from '../components/home/TopPlayers.jsx'

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
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#ff6b35' }}>STARTING SOON</span>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#ff6b35', marginTop: 2 }}>TAP TO PLAY →</p>
      </div>
    )
  }

  if (total < 60 * 60 * 1000) {
    return (
      <div style={{ textAlign: 'right' }}>
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: '#e0e0f0', letterSpacing: '0.04em' }}>
          {minutes}:{String(seconds).padStart(2, '0')}
        </span>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55', marginTop: 2 }}>TAP TO PLAY →</p>
      </div>
    )
  }

  return (
    <div style={{ textAlign: 'right' }}>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#8888aa' }}>
        {new Date(date).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
      </span>
      <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55', marginTop: 2 }}>TAP TO PLAY →</p>
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

  useEffect(() => {
    if (!user) return
    const finishedRooms = allRooms.filter((r) => r.status === 'finished')
    if (finishedRooms.length === 0) return
    const fetchRanks = async () => {
      const ranks = {}
      for (const room of finishedRooms) {
        const { data: cards } = await supabase
          .from('cards')
          .select('user_id, lines_completed, squares_marked')
          .eq('room_id', room.id)
          .order('lines_completed', { ascending: false })
          .order('squares_marked', { ascending: false })
        if (cards) {
          const rank = cards.findIndex((c) => c.user_id === user.id) + 1
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

  // Mobile: flat priority-sorted list (live first, then finished, then lobby)
  const mobileSortedGames = useMemo(() => {
    return [...allRooms].sort((a, b) => {
      const aLive = a.status === 'live' ? 1 : 0
      const bLive = b.status === 'live' ? 1 : 0
      const aFinished = a.status === 'finished' ? 1 : 0
      const bFinished = b.status === 'finished' ? 1 : 0
      const aPriority = aLive * 4 + aFinished * 2
      const bPriority = bLive * 4 + bFinished * 2
      if (bPriority !== aPriority) return bPriority - aPriority
      const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
      const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
      return aTime - bTime
    })
  }, [allRooms])

  // Desktop: group by sport, sorted live → lobby → finished
  const roomsBySport = useMemo(() => {
    const statusRank = (r) => r.status === 'live' ? 0 : r.status === 'lobby' ? 1 : 2
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
        if (a.status === 'finished') return (b.starts_at ?? '') > (a.starts_at ?? '') ? 1 : -1
        return (a.starts_at ?? '') > (b.starts_at ?? '') ? 1 : -1
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
                fontFamily: 'var(--db-font-mono)',
                fontSize: 'clamp(18px, 3vw, 28px)',
                fontWeight: 800,
                letterSpacing: '0.10em',
                lineHeight: 1,
                color: '#e0e0f0',
                textTransform: 'uppercase',
              }}
            >
              Games
            </h1>
            <p className="hidden md:block mt-1" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#3a3a55', letterSpacing: '0.06em' }}>
              Live bingo powered by real stats
            </p>
          </div>
          {!loading && liveCount > 0 && (
            <span
              className="inline-flex items-center gap-1.5"
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: '#ff2d2d',
                background: 'rgba(255,45,45,0.10)',
                border: '1px solid rgba(255,45,45,0.22)',
                padding: '3px 9px',
                borderRadius: 6,
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#ff2d2d', display: 'inline-block', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
              {liveCount} LIVE
            </span>
          )}
        </div>
      </div>

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
                padding: '8px 16px', borderRadius: 20, border: 'none',
                background: isActive ? '#ff6b35' : '#1a1a2e',
                color: isActive ? '#0c0c14' : '#8888aa',
                fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', cursor: 'pointer', flexShrink: 0,
                transition: 'background 0.15s ease, color 0.15s ease',
              }}
            >
              {tab.icon && <span style={{ fontSize: 13 }}>{tab.icon}</span>}
              {tab.label}
              {count > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 8,
                  background: isActive ? 'rgba(0,0,0,0.2)' : '#2a2a44',
                  color: isActive ? '#0c0c14' : '#555577',
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
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55' }}>
            {loading ? '…' : `${filteredMobileGames.length} game${filteredMobileGames.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 58, borderRadius: 6, background: '#12121e' }} />
            ))}
          </div>
        )}

        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {filteredMobileGames.length === 0 ? (
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', padding: '12px 0' }}>
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
              const group = isLive ? 'live' : isFinished ? 'finished' : tomorrow ? 'tomorrow' : 'today'

              const prevGroup = i > 0 ? (() => {
                const pr = filteredMobileGames[i - 1]
                const pl = pr.status === 'live', pf = pr.status === 'finished'
                const pt = !pl && !pf && isTomorrow(pr.starts_at)
                return pl ? 'live' : pf ? 'finished' : pt ? 'tomorrow' : 'today'
              })() : null

              const LABEL = { live: '● LIVE NOW', finished: 'RECENTLY FINISHED', today: 'COMING UP', tomorrow: 'TOMORROW' }
              const LABEL_COLOR = { live: '#ff2d2d', finished: '#3a3a55', today: '#8888aa', tomorrow: '#3a3a55' }

              if (group !== prevGroup) {
                acc.push(
                  <div key={`label-${room.id}`} style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700,
                    color: LABEL_COLOR[group], letterSpacing: '0.12em',
                    padding: i === 0 ? '0 0 4px' : '10px 0 4px',
                  }}>
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
                    background: isFinished || tomorrow ? '#0e0e18' : `linear-gradient(to right, ${hexToRgba(awayColor, 0.06)}, #12121e 30%, #12121e 70%, ${hexToRgba(homeColor, 0.06)})`,
                    borderRadius: 8,
                    border: isLive ? '1px solid rgba(255,45,45,0.3)' : isFinished ? '1px solid #1a1a2e' : tomorrow ? '1px solid #1a1a2e' : '1px solid #2a2a44',
                    borderLeft: isLive ? '3px solid #ff2d2d' : isFinished ? '3px solid #2a2a44' : tomorrow ? '3px solid #1a1a2e' : `3px solid ${homeColor}`,
                    cursor: tomorrow ? 'default' : 'pointer',
                    opacity: tomorrow ? 0.5 : 1,
                  }}
                >
                  {/* Left: medal + teams */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {isFinished && rank > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 32 }}>
                        <span style={{
                          fontFamily: 'var(--db-font-display)',
                          fontSize: rank <= 3 ? 26 : 18, fontWeight: 800, lineHeight: 1,
                          color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#555577',
                        }}>{rank}</span>
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
                          fontFamily: 'var(--db-font-mono)', fontSize: 18, fontWeight: 800,
                          color: isFinished ? '#555577' : tomorrow ? '#3a3a55' : awayColor,
                          opacity: isFinished || tomorrow ? 1 : 0.8, letterSpacing: '0.04em',
                        }}>{away}</span>
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#3a3a55' }}>vs</span>
                        <span style={{
                          fontFamily: 'var(--db-font-mono)', fontSize: 18, fontWeight: 800,
                          color: isFinished ? '#555577' : tomorrow ? '#3a3a55' : homeColor,
                          letterSpacing: '0.04em',
                        }}>{home}</span>
                      </div>
                      {room.sport && room.sport !== 'nba' && (
                        <span style={{
                          fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 700,
                          color: room.sport === 'ncaa' ? '#22c55e' : room.sport === 'mlb' ? '#ff6b35' : '#555577',
                          letterSpacing: '0.08em', textTransform: 'uppercase',
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
                          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#ff2d2d' }}>LIVE</span>
                        </div>
                        {room.away_score != null && room.home_score != null && (
                          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: '#e0e0f0', margin: '4px 0 0' }}>{room.away_score} - {room.home_score}</p>
                        )}
                        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#ff6b35', marginTop: 2 }}>TAP TO PLAY →</p>
                      </div>
                    ) : isFinished ? (
                      <div>
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#3a3a55', letterSpacing: '0.08em' }}>FINAL</span>
                        {room.away_score != null && room.home_score != null && (
                          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#555577', margin: '2px 0 0' }}>{room.away_score} - {room.home_score}</p>
                        )}
                        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55', marginTop: 2 }}>VIEW RESULTS →</p>
                      </div>
                    ) : tomorrow ? (
                      <div>
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#3a3a55', letterSpacing: '0.08em' }}>TOMORROW</span>
                        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#3a3a55', marginTop: 2 }}>
                          {new Date(room.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 700, color: '#8888aa' }}>
                          {room.starts_at
                            ? new Date(room.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                            : 'Upcoming'}
                        </span>
                        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#ff6b35', marginTop: 2 }}>TAP TO PLAY →</p>
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
