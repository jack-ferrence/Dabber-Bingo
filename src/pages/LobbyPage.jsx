import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hapticSelection } from '../lib/haptics.js'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useHomeData } from '../hooks/useHomeData.js'
import DashboardCard from '../components/home/DashboardCard.jsx'
import TopPlayers from '../components/home/TopPlayers.jsx'
import FeaturedBanner from '../components/home/FeaturedBanner.jsx'

function localDateStr(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function todayLocal() { return localDateStr(new Date()) }
function tomorrowLocal() { return localDateStr(new Date(Date.now() + 86_400_000)) }
function getDayLabel(startsAt) {
  if (!startsAt) return 'today'
  const gameDate = localDateStr(new Date(startsAt))
  if (gameDate === todayLocal()) return 'today'
  if (gameDate === tomorrowLocal()) return 'tomorrow'
  if (gameDate < todayLocal()) return 'past'
  return 'future'
}

const SPORTS = [
  { key: 'all', label: 'All' },
  { key: 'nba', label: 'NBA' },
  { key: 'mlb', label: 'MLB' },
  { key: 'ncaa', label: 'NCAA' },
]

export default function LobbyPage() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { allRooms, myRooms, loading, error } = useHomeData()
  const [activeSport, setActiveSport] = useState('all')
  const [finishedRanks, setFinishedRanks] = useState({})

  const handleOpenGame = (roomId) => {
    if (!user) { navigate('/login'); return }
    navigate(`/room/${roomId}`)
  }

  // Derive joined room IDs
  const myRoomIds = useMemo(() => new Set(myRooms.map((r) => r.id)), [myRooms])

  // Card info map: roomId → { squares_marked, lines_completed }
  const cardInfoByRoom = useMemo(() => {
    const m = {}
    for (const r of myRooms) {
      m[r.id] = { squares_marked: r.squares_marked ?? null, lines_completed: r.lines_completed ?? 0 }
    }
    return m
  }, [myRooms])

  // Fetch finished ranks
  useEffect(() => {
    if (!user) return
    const finishedJoined = allRooms.filter((r) => r.status === 'finished' && myRoomIds.has(r.id))
    if (finishedJoined.length === 0) return
    const go = async () => {
      const ranks = {}
      for (const room of finishedJoined) {
        try {
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
        } catch { /* ignore */ }
      }
      setFinishedRanks(ranks)
    }
    go()
  }, [allRooms, user, myRoomIds])

  // Filter by sport
  const filtered = useMemo(() => {
    if (activeSport === 'all') return allRooms
    return allRooms.filter((r) => (r.sport ?? 'nba') === activeSport)
  }, [allRooms, activeSport])

  // Group into sections
  const sections = useMemo(() => {
    const myGamesToday = []
    const myGamesTomorrow = []
    const liveNotJoined = []
    const todayLobby = []
    const tomorrowLobby = []
    const finishedJoined = []
    const finishedOther = []

    for (const room of filtered) {
      const isJoined = myRoomIds.has(room.id)
      const dayLabel = getDayLabel(room.starts_at)

      if (isJoined && (room.status === 'live' || room.status === 'lobby')) {
        if (dayLabel === 'tomorrow' || dayLabel === 'future') myGamesTomorrow.push(room)
        else myGamesToday.push(room)
      } else if (room.status === 'live') {
        liveNotJoined.push(room)
      } else if (room.status === 'lobby') {
        if (dayLabel === 'tomorrow' || dayLabel === 'future') tomorrowLobby.push(room)
        else todayLobby.push(room)
      } else if (room.status === 'finished') {
        if (isJoined) finishedJoined.push(room)
        else finishedOther.push(room)
      }
    }

    myGamesToday.sort((a, b) => (b.status === 'live' ? 1 : 0) - (a.status === 'live' ? 1 : 0) || new Date(a.starts_at) - new Date(b.starts_at))
    myGamesTomorrow.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    liveNotJoined.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    todayLobby.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    tomorrowLobby.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    finishedJoined.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
    finishedOther.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))

    const myGames = [...myGamesToday, ...myGamesTomorrow]
    const finished = [...finishedJoined, ...finishedOther].slice(0, 10)

    const allTodayDone = liveNotJoined.length === 0 && todayLobby.length === 0 &&
      myGamesToday.every(g => g.status !== 'live' && g.status !== 'lobby')

    return { myGames, liveNotJoined, todayLobby, tomorrowLobby, finished, allTodayDone }
  }, [filtered, myRoomIds])

  const liveCount = allRooms.filter((r) => r.status === 'live').length

  // ── Section renderer ──
  function CardRow({ games, size, isJoinedSection = false }) {
    return (
      <div className="no-scrollbar" style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 20px 4px', scrollSnapType: 'x mandatory', WebkitOverflowScrolling: 'touch' }}>
        {games.map((room) => (
          <DashboardCard
            key={room.id}
            room={room}
            onOpenGame={handleOpenGame}
            isJoined={isJoinedSection || myRoomIds.has(room.id)}
            size={size}
            rank={finishedRanks[room.id] ?? 0}
            squaresMarked={cardInfoByRoom[room.id]?.squares_marked ?? null}
          />
        ))}
      </div>
    )
  }

  return (
    <div style={{ paddingBottom: 20 }}>
      {/* ── Header ── */}
      <div style={{ padding: '20px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <span className="lobby-title" style={{ fontFamily: 'var(--db-font-display)', fontSize: 30, fontWeight: 400, letterSpacing: '0.06em', color: 'var(--db-text-primary)', lineHeight: 1 }}>
            GAMES
          </span>
          {liveCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,45,45,0.1)', border: '1px solid rgba(255,45,45,0.2)', borderRadius: 6, padding: '4px 10px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff2d2d', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 13, fontWeight: 400, letterSpacing: '0.06em', color: '#ff4444' }}>
                {liveCount} LIVE
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Sport tabs ── */}
      <div style={{ display: 'flex', gap: 0, padding: '8px 20px 0', borderBottom: '1px solid var(--db-border-subtle)' }}>
        {SPORTS.map((s) => {
          const isActive = activeSport === s.key
          const count = s.key === 'all'
            ? allRooms.filter((r) => r.status === 'live' || r.status === 'lobby').length
            : allRooms.filter((r) => (r.sport ?? 'nba') === s.key && (r.status === 'live' || r.status === 'lobby')).length
          return (
            <button
              key={s.key}
              onClick={() => { hapticSelection(); setActiveSport(s.key) }}
              style={{
                padding: '6px 0 10px', marginRight: 24,
                background: 'none', cursor: 'pointer',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: `2px solid ${isActive ? '#ff6b35' : 'transparent'}`,
                color: isActive ? 'var(--db-text-primary)' : 'var(--db-text-ghost)',
                fontFamily: 'var(--db-font-mono)', fontSize: 13,
                fontWeight: isActive ? 600 : 500, letterSpacing: '0.02em',
                transition: 'color 120ms ease',
              }}
            >
              {s.label}{count > 0 ? ` ${count}` : ''}
            </button>
          )
        })}
      </div>

      {/* ── Featured banner ── */}
      <FeaturedBanner />

      {/* ── Top players ── */}
      <div style={{ padding: '12px 20px 0' }}>
        <TopPlayers />
      </div>

      {/* Error */}
      {error && (
        <div style={{ margin: '12px 20px', padding: '10px 14px', background: 'rgba(255,45,45,0.08)', border: '1px solid rgba(255,45,45,0.2)', borderRadius: 8, fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff4444' }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: 12, overflowX: 'auto' }}>
            {[1,2,3].map((i) => (
              <div key={i} style={{ flexShrink: 0, width: 260, height: 140, borderRadius: 14, background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-subtle)', animation: 'pulse 1.8s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECTION: Your Games ═══ */}
      {!loading && sections.myGames.length > 0 && (
        <div style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--db-text-secondary)' }}>Your games</span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 8px', borderRadius: 4 }}>
                {sections.myGames.length} active
              </span>
            </div>
          </div>
          <CardRow games={sections.myGames} size="large" isJoinedSection={true} />
        </div>
      )}

      {/* ═══ SECTION: Live Now ═══ */}
      {!loading && sections.liveNotJoined.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff2d2d', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--db-text-secondary)' }}>Live now</span>
            </div>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-ghost)' }}>{sections.liveNotJoined.length} games</span>
          </div>
          <CardRow games={sections.liveNotJoined} size="medium" />
        </div>
      )}

      {/* ═══ SECTION: Tonight / Today ═══ */}
      {!loading && sections.todayLobby.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--db-text-secondary)' }}>Tonight</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-ghost)' }}>{sections.todayLobby.length} games</span>
          </div>
          <CardRow games={sections.todayLobby} size="small" />
        </div>
      )}

      {/* ═══ SECTION: Your Results (when all today's games are done) ═══ */}
      {!loading && sections.allTodayDone && sections.finished.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--db-text-secondary)' }}>Today's results</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-ghost)' }}>{sections.finished.length} games</span>
          </div>
          <CardRow games={sections.finished} size="small" />
        </div>
      )}

      {/* ═══ SECTION: Tomorrow ═══ */}
      {!loading && sections.tomorrowLobby.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--db-text-secondary)' }}>Tomorrow</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-ghost)' }}>{sections.tomorrowLobby.length} games</span>
          </div>
          <CardRow games={sections.tomorrowLobby} size="small" />
        </div>
      )}

      {/* ═══ SECTION: Recently Finished (when today's games still in progress) ═══ */}
      {!loading && !sections.allTodayDone && sections.finished.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'var(--db-text-ghost)' }}>Recently finished</span>
          </div>
          <CardRow games={sections.finished} size="tiny" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: 'var(--db-text-muted)' }}>No games available. Check back later!</span>
        </div>
      )}
    </div>
  )
}
