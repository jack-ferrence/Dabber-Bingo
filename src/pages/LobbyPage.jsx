import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useHomeData } from '../hooks/useHomeData.js'
import SportSection from '../components/home/SportSection.jsx'

const SPORT_SECTIONS = [
  { sport: 'nba',  label: '🏀 NBA' },
  { sport: 'ncaa', label: '🏆 NCAA Tournament' },
]

export default function LobbyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { allRooms, myRooms, loading, error } = useHomeData()

  const [joiningRoomId, setJoiningRoomId] = useState(null)
  const [joinError, setJoinError] = useState('')

  // Set of room IDs the user has already joined
  const joinedRoomIds = useMemo(
    () => new Set(myRooms.map((r) => r.id)),
    [myRooms]
  )

  // Group all public rooms by sport, sorted: live → lobby → finished
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
        // Within same status: scheduled by starts_at asc, finished by starts_at desc
        if (a.status === 'finished') return (b.starts_at ?? '') > (a.starts_at ?? '') ? 1 : -1
        return (a.starts_at ?? '') > (b.starts_at ?? '') ? 1 : -1
      })
    }
    return groups
  }, [allRooms])

  const handleJoin = async (roomId) => {
    if (!user) { navigate('/login'); return }
    setJoinError('')
    setJoiningRoomId(roomId)

    const { error: err } = await supabase
      .from('room_participants')
      .upsert(
        { room_id: roomId, user_id: user.id },
        { onConflict: 'room_id,user_id', ignoreDuplicates: true }
      )

    setJoiningRoomId(null)

    if (err) { setJoinError(err.message); return }
    navigate(`/room/${roomId}`)
  }

  const handleContinue = (roomId) => navigate(`/room/${roomId}`)

  const handleTabClick = (sportKey) => {
    const el = document.getElementById(`sport-section-${sportKey}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const liveCount = allRooms.filter((r) => r.status === 'live').length

  return (
    <div className="px-6 py-8 max-w-[1200px] mx-auto">
      {/* Page header */}
      <div className="mb-9">
        <div className="flex items-baseline gap-3 flex-wrap">
          <h1
            className="lobby-title"
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 'clamp(36px, 4vw, 52px)',
              letterSpacing: '0.05em',
              lineHeight: 1,
              color: '#e0e0f0',
            }}
          >
            Tonight&apos;s Games
          </h1>
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
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: '50%',
                  background: '#ff2d2d',
                  display: 'inline-block',
                  animation: 'pulse-live 1.4s ease-in-out infinite',
                }}
              />
              {liveCount} LIVE
            </span>
          )}
        </div>
        <p className="mt-2 text-sm" style={{ color: '#555577' }}>
          Live bingo powered by real stats. Pick a game and play.
        </p>
      </div>

      {/* Error */}
      {(error || joinError) && (
        <div
          className="mb-6 px-4 py-3"
          style={{
            background: 'rgba(255,45,45,0.08)',
            border: '1px solid rgba(255,45,45,0.25)',
            borderRadius: 6,
            fontFamily: 'var(--db-font-mono)',
            fontSize: 12,
            color: '#ff2d2d',
          }}
        >
          {error || joinError}
        </div>
      )}

      {/* Sport sections */}
      <div className="space-y-10">
        {SPORT_SECTIONS.map((section, i) => (
          <div key={section.sport} id={`sport-section-${section.sport}`}>
            <SportSection
              sport={section.sport}
              label={section.label}
              games={roomsBySport[section.sport] ?? []}
              loading={loading}
              joinedRoomIds={joinedRoomIds}
              joiningRoomId={joiningRoomId}
              onJoin={handleJoin}
              onContinue={handleContinue}
              style={{ animationDelay: `${i * 100}ms` }}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
