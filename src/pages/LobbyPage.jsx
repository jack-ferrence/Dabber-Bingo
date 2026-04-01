import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useHomeData } from '../hooks/useHomeData.js'
import DashboardCard from '../components/home/DashboardCard.jsx'
import TopPlayers from '../components/home/TopPlayers.jsx'
import FeaturedBanner from '../components/home/FeaturedBanner.jsx'

function isTomorrow(startsAt) {
  if (!startsAt) return false
  const gameDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(startsAt))
  const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(Date.now() + 86_400_000))
  return gameDate === tomorrow
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
    const myGames = []
    const liveNotJoined = []
    const todayLobby = []
    const tomorrowLobby = []
    const finished = []

    for (const room of filtered) {
      const isJoined = myRoomIds.has(room.id)
      if (isJoined && (room.status === 'live' || room.status === 'lobby')) {
        myGames.push(room)
      } else if (room.status === 'live') {
        liveNotJoined.push(room)
      } else if (room.status === 'lobby') {
        if (isTomorrow(room.starts_at)) tomorrowLobby.push(room)
        else todayLobby.push(room)
      } else if (room.status === 'finished') {
        finished.push(room)
      }
    }

    // Sort
    myGames.sort((a, b) => (b.status === 'live' ? 1 : 0) - (a.status === 'live' ? 1 : 0) || new Date(a.starts_at) - new Date(b.starts_at))
    liveNotJoined.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    todayLobby.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    tomorrowLobby.sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    finished.sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))

    return { myGames, liveNotJoined, todayLobby, tomorrowLobby, finished: finished.slice(0, 10) }
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
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 30, fontWeight: 900, letterSpacing: '0.02em', color: '#e8e8f4', lineHeight: 1 }}>
            GAMES
          </span>
          {liveCount > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(255,45,45,0.1)', border: '1px solid rgba(255,45,45,0.2)', borderRadius: 6, padding: '4px 10px' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff2d2d', animation: 'pulse-live 1.4s ease-in-out infinite' }} />
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', color: '#ff4444' }}>
                {liveCount} LIVE
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── Sport tabs ── */}
      <div style={{ display: 'flex', gap: 0, padding: '8px 20px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        {SPORTS.map((s) => {
          const isActive = activeSport === s.key
          const count = s.key === 'all'
            ? allRooms.filter((r) => r.status === 'live' || r.status === 'lobby').length
            : allRooms.filter((r) => (r.sport ?? 'nba') === s.key && (r.status === 'live' || r.status === 'lobby')).length
          return (
            <button
              key={s.key}
              onClick={() => setActiveSport(s.key)}
              style={{
                padding: '6px 0 10px', marginRight: 24,
                background: 'none', cursor: 'pointer',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: `2px solid ${isActive ? '#ff6b35' : 'transparent'}`,
                color: isActive ? '#e8e8f4' : 'rgba(255,255,255,0.35)',
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
              <div key={i} style={{ flexShrink: 0, width: 260, height: 140, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.04)', animation: 'pulse 1.8s ease-in-out infinite' }} />
            ))}
          </div>
        </div>
      )}

      {/* ═══ SECTION: Your Games ═══ */}
      {!loading && sections.myGames.length > 0 && (
        <div style={{ paddingTop: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Your games</span>
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
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Live now</span>
            </div>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{sections.liveNotJoined.length} games</span>
          </div>
          <CardRow games={sections.liveNotJoined} size="medium" />
        </div>
      )}

      {/* ═══ SECTION: Tonight / Today ═══ */}
      {!loading && sections.todayLobby.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Tonight</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{sections.todayLobby.length} games</span>
          </div>
          <CardRow games={sections.todayLobby} size="small" />
        </div>
      )}

      {/* ═══ SECTION: Tomorrow ═══ */}
      {!loading && sections.tomorrowLobby.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)' }}>Tomorrow</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{sections.tomorrowLobby.length} games</span>
          </div>
          <CardRow games={sections.tomorrowLobby} size="small" />
        </div>
      )}

      {/* ═══ SECTION: Finished ═══ */}
      {!loading && sections.finished.length > 0 && (
        <div style={{ paddingTop: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 20px', marginBottom: 12 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.35)' }}>Recently finished</span>
          </div>
          <CardRow games={sections.finished} size="tiny" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div style={{ padding: '40px 20px', textAlign: 'center' }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No games available. Check back later!</span>
        </div>
      )}
    </div>
  )
}
