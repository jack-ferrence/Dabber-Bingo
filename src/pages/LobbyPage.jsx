import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useHomeData } from '../hooks/useHomeData.js'
import SportSection from '../components/home/SportSection.jsx'
import JoinConfirmModal from '../components/home/JoinConfirmModal.jsx'
import JoinAllConfirmModal from '../components/home/JoinAllConfirmModal.jsx'
import TopPlayers from '../components/home/TopPlayers.jsx'
import { generateOddsBasedCard } from '../game/oddsCardGenerator.js'

/**
 * Pre-generate a card for a room the player just joined.
 * Fetches odds_pool directly so it works regardless of what useHomeData includes.
 * Non-blocking — if it fails, GamePage will generate on first visit.
 */
async function preGenerateCard(roomId, userId) {
  try {
    const { data: room } = await supabase
      .from('rooms')
      .select('odds_status, odds_pool, participant_count')
      .eq('id', roomId)
      .maybeSingle()

    if (!room || room.odds_status !== 'ready' || !room.odds_pool?.length) return
    if (room.odds_pool.length < 24) return

    const { data: existing } = await supabase
      .from('cards')
      .select('id')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existing) return

    const playerCount = room.participant_count ?? 1
    const card = generateOddsBasedCard(room.odds_pool, playerCount)
    if (!card) return

    await supabase
      .from('cards')
      .insert({ room_id: roomId, user_id: userId, squares: card })
  } catch (err) {
    console.warn('[LobbyPage] preGenerateCard failed:', err.message)
  }
}

const SPORT_SECTIONS = [
  { sport: 'nba',  label: '🏀 NBA' },
  { sport: 'ncaa', label: '🏆 NCAA' },
  { sport: 'mlb',  label: '⚾ MLB' },
]

export default function LobbyPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { allRooms, myRooms, loading, error } = useHomeData()

  const [joiningRoomId, setJoiningRoomId] = useState(null)
  const [joinError, setJoinError] = useState('')
  const [pendingJoinRoom, setPendingJoinRoom] = useState(null)
  const [joinAllPending, setJoinAllPending] = useState(null) // { sport, rooms }
  const [joinAllInProgress, setJoinAllInProgress] = useState(false)

  // Set of room IDs the user has already joined
  const joinedRoomIds = useMemo(
    () => new Set(myRooms.map((r) => r.id)),
    [myRooms]
  )

  // Mobile: flat priority-sorted list (live+joined first, then upcoming)
  const mobileSortedGames = useMemo(() => {
    const all = allRooms.filter((r) => r.status === 'live' || r.status === 'lobby')
    return all.sort((a, b) => {
      const aJoined = joinedRoomIds.has(a.id) ? 1 : 0
      const bJoined = joinedRoomIds.has(b.id) ? 1 : 0
      const aLive = a.status === 'live' ? 1 : 0
      const bLive = b.status === 'live' ? 1 : 0
      // Priority: live+joined=3, live+unjoined=2, lobby+joined=1, lobby+unjoined=0
      const aPriority = aLive * 2 + aJoined
      const bPriority = bLive * 2 + bJoined
      if (bPriority !== aPriority) return bPriority - aPriority
      // Within same priority: soonest first
      const aTime = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
      const bTime = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
      return aTime - bTime
    })
  }, [allRooms, joinedRoomIds])

  // Desktop: group all public rooms by sport, sorted: live → lobby → finished
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

  const doJoin = async (roomId) => {
    setJoinError('')
    setJoiningRoomId(roomId)

    // Charge entry fee before inserting participant row
    try {
      const { data: feeResult, error: rpcError } = await supabase.rpc('deduct_entry_fee', {
        p_user_id: user.id,
        p_room_id: roomId,
      })

      if (rpcError) {
        const isMissing = rpcError.code === 'PGRST202' || rpcError.code === '42883' ||
          rpcError.message?.toLowerCase().includes('function')
        if (!isMissing) {
          setJoinError('Failed to process entry fee: ' + rpcError.message)
          setJoiningRoomId(null)
          return
        }
        // Function not found — graceful fallback, continue
        console.warn('[LobbyPage] deduct_entry_fee not found, skipping fee')
      } else if (feeResult && !feeResult.success) {
        if (feeResult.reason === 'insufficient_dabs') {
          setJoinError(`Not enough Dobs! You need 10 but only have ${feeResult.balance}.`)
        } else if (feeResult.reason === 'profile_not_found') {
          setJoinError('Profile not found. Try logging out and back in.')
        } else {
          setJoinError('Could not join: ' + feeResult.reason)
        }
        setJoiningRoomId(null)
        return
      }
    } catch (feeErr) {
      console.warn('[LobbyPage] deduct_entry_fee threw', feeErr)
    }

    const { error: err } = await supabase
      .from('room_participants')
      .upsert(
        { room_id: roomId, user_id: user.id },
        { onConflict: 'room_id,user_id', ignoreDuplicates: true }
      )

    setJoiningRoomId(null)

    if (err) { setJoinError(err.message); return }

    // Pre-generate card before navigating so late-entry check can't block the player
    await preGenerateCard(roomId, user.id)

    navigate(`/room/${roomId}`)
  }

  const handleJoin = (roomId) => {
    if (!user) { navigate('/login'); return }
    const room = allRooms.find((r) => r.id === roomId)
    const isNcaa = room?.sport === 'ncaa'
    if (isNcaa || !room) {
      doJoin(roomId)
    } else {
      setPendingJoinRoom(room)
    }
  }

  const handleConfirmJoin = () => {
    if (!pendingJoinRoom) return
    const roomId = pendingJoinRoom.id
    setPendingJoinRoom(null)
    doJoin(roomId)
  }

  const handleCancelJoin = () => {
    setPendingJoinRoom(null)
  }

  const handleContinue = (roomId) => navigate(`/room/${roomId}`)

  const handleJoinAll = (sport, unjoinedRooms) => {
    if (!user) { navigate('/login'); return }
    setJoinAllPending({ sport, rooms: unjoinedRooms })
  }

  const handleConfirmJoinAll = async () => {
    if (!joinAllPending) return
    setJoinAllInProgress(true)
    setJoinError('')

    const { rooms } = joinAllPending
    let failedCount = 0

    for (const room of rooms) {
      const { data: feeResult, error: feeError } = await supabase.rpc('deduct_entry_fee', {
        p_user_id: user.id,
        p_room_id: room.id,
      })

      if (feeError) {
        const missing = feeError.code === 'PGRST202' || feeError.code === '42883'
        if (!missing) {
          failedCount++
          continue
        }
        // RPC not found — proceed anyway (graceful fallback)
      } else if (feeResult && !feeResult.success) {
        if (feeResult.reason === 'insufficient_dabs') {
          setJoinError(`Ran out of Dobs after joining ${rooms.indexOf(room)} game(s).`)
          break
        }
        if (feeResult.reason !== 'already_charged' && feeResult.reason !== 'march_madness_free') {
          failedCount++
          continue
        }
      }

      const { error: joinErr } = await supabase
        .from('room_participants')
        .upsert(
          { room_id: room.id, user_id: user.id },
          { onConflict: 'room_id,user_id', ignoreDuplicates: true }
        )

      if (joinErr) {
        failedCount++
      } else {
        // Pre-generate card immediately after joining so late-entry check can't block the player
        await preGenerateCard(room.id, user.id)
      }
    }

    setJoinAllInProgress(false)
    setJoinAllPending(null)

    if (failedCount > 0) {
      setJoinError(`Joined ${rooms.length - failedCount} of ${rooms.length} games. ${failedCount} failed.`)
    }
  }

  const handleTabClick = (sportKey) => {
    const el = document.getElementById(`sport-section-${sportKey}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

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

      {/* Top players */}
      <div style={{ marginBottom: 16 }}>
        <TopPlayers />
      </div>

      {/* ── Desktop: sport-grouped sections (unchanged) ── */}
      <div className="hidden md:block space-y-10">
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
              onJoinAll={handleJoinAll}
              style={{ animationDelay: `${i * 100}ms` }}
            />
          </div>
        ))}
      </div>

      {/* ── Mobile: flat priority-sorted list ── */}
      <div className="block md:hidden">
        {/* Summary line */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {liveCount > 0 && (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, padding: '2px 6px', background: 'rgba(255,45,45,0.12)', color: '#ff2d2d', borderRadius: 3 }}>
              {liveCount} LIVE
            </span>
          )}
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55' }}>
            {loading ? '…' : `${mobileSortedGames.length} game${mobileSortedGames.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Skeleton */}
        {loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} style={{ height: 58, borderRadius: 6, background: '#12121e' }} />
            ))}
          </div>
        )}

        {/* Game rows */}
        {!loading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {mobileSortedGames.length === 0 ? (
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', padding: '12px 0' }}>
                No games available. Check back later!
              </p>
            ) : mobileSortedGames.map((room) => {
              const nameParts = (room.name || '').split(' vs ')
              const away = nameParts[0]?.trim() || '?'
              const home = nameParts[1]?.trim() || '?'
              const isJoined = joinedRoomIds.has(room.id)
              const isLive = room.status === 'live'
              const isNcaa = room.sport === 'ncaa'
              const tipoff = room.starts_at
                ? new Date(room.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                : 'Upcoming'

              return (
                <div
                  key={room.id}
                  onClick={() => isJoined ? navigate(`/room/${room.id}`) : handleJoin(room.id)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 14px', background: '#12121e', borderRadius: 6,
                    borderLeft: isLive ? '3px solid #ff2d2d' : '3px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {/* Left: teams + info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div style={{ flexShrink: 0 }}>
                      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 18, fontWeight: 800, color: '#8888aa', letterSpacing: '0.04em' }}>{away}</span>
                      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#3a3a55', margin: '0 5px' }}>vs</span>
                      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 18, fontWeight: 800, color: '#e0e0f0', letterSpacing: '0.04em' }}>{home}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {isLive ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#ff2d2d', fontWeight: 700 }}>● LIVE</span>
                          {room.game_clock && (
                            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55' }}>
                              {room.game_period ? `Q${room.game_period} ` : ''}{room.game_clock}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577' }}>{tipoff}</span>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55' }}>
                          {room.participant_count ?? 0} playing
                        </span>
                        {isNcaa && (
                          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 700, padding: '1px 4px', background: 'rgba(0,200,100,0.10)', color: '#00c864', borderRadius: 2 }}>
                            NCAA
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: status/action */}
                  <div style={{ flexShrink: 0, marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
                    {isJoined ? (
                      isLive ? (
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#555577', background: '#1a1a2e', padding: '5px 10px', borderRadius: 3 }}>
                          PLAYING
                        </span>
                      ) : (
                        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#ff6b35', border: '1px solid rgba(255,107,53,0.3)', padding: '5px 10px', borderRadius: 3 }}>
                          JOINED
                        </span>
                      )
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleJoin(room.id) }}
                        disabled={joiningRoomId === room.id}
                        style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#0c0c14', background: '#ff6b35', border: 'none', borderRadius: 4, padding: '6px 14px', cursor: joiningRoomId === room.id ? 'wait' : 'pointer' }}
                      >
                        {joiningRoomId === room.id ? '...' : 'JOIN'}
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* NBA join confirmation modal */}
      {pendingJoinRoom && (
        <JoinConfirmModal
          room={pendingJoinRoom}
          onConfirm={handleConfirmJoin}
          onClose={handleCancelJoin}
        />
      )}

      {/* Join All confirmation modal */}
      {joinAllPending && (
        <JoinAllConfirmModal
          sport={joinAllPending.sport}
          rooms={joinAllPending.rooms}
          onConfirm={handleConfirmJoinAll}
          onClose={() => { setJoinAllPending(null); setJoinAllInProgress(false) }}
          joining={joinAllInProgress}
        />
      )}
    </div>
  )
}
