import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRoomChannel } from '../hooks/useRoomChannel.js'
import GameRoom from '../components/game/GameRoom.jsx'

function GamePage() {
  const { roomId } = useParams()
  const { user, loading: authLoading } = useAuth()

  const [room, setRoom] = useState(null)
  const [card, setCard] = useState(null)
  const [loadingRoom, setLoadingRoom] = useState(true)
  const [loadingCard, setLoadingCard] = useState(true)
  const [error, setError] = useState('')
  const [gameStartedNotification, setGameStartedNotification] = useState(false)
  const prevStatusRef = useRef(null)

  const {
    roomPatch,
    cardPatch,
    leaderboardCards,
    chatMessages,
    statEvents,
    participantJoined,
    initChatMessages,
    resetStatEvents,
  } = useRoomChannel(roomId, room?.game_id, user?.id)

  // Apply room patches from the consolidated channel
  useEffect(() => {
    if (!roomPatch) return
    setRoom((prev) => (prev ? { ...prev, ...roomPatch } : prev))
  }, [roomPatch])

  // Apply card patches from the consolidated channel
  useEffect(() => {
    if (!cardPatch) return
    setCard((prev) => (prev ? { ...prev, ...cardPatch } : prev))
  }, [cardPatch])

  // Load room
  useEffect(() => {
    if (!roomId) return
    const loadRoom = async () => {
      setLoadingRoom(true)
      setError('')
      const { data, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('id', roomId)
        .maybeSingle()
      if (roomError) {
        setError(roomError.message)
        setLoadingRoom(false)
        return
      }
      setRoom(data)
      setLoadingRoom(false)
    }
    loadRoom()
  }, [roomId])

  // "Game Started!" notification on status transition
  useEffect(() => {
    const prev = prevStatusRef.current
    const next = room?.status
    prevStatusRef.current = next
    if (next === 'live' && prev !== 'live') {
      setGameStartedNotification(true)
      const t = setTimeout(() => setGameStartedNotification(false), 4000)
      return () => clearTimeout(t)
    }
  }, [room?.status])

  // Load or create card
  useEffect(() => {
    if (!roomId || !user || authLoading || !room) return
    const debug = import.meta.env.DEV
    const loadOrCreateCard = async () => {
      setLoadingCard(true)
      setError('')

      let players = null
      if (room.game_id) {
        try {
          const rosterUrl = `/.netlify/functions/get-roster?game_id=${room.game_id}&sport=${room.sport || 'nba'}`
          if (debug) console.log('[GamePage] fetching roster', rosterUrl)
          const res = await fetch(rosterUrl)
          if (debug) console.log('[GamePage] roster response status', res.status)
          if (res.ok) {
            const roster = await res.json()
            players = (roster.players ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              lastName: p.lastName,
            }))
            if (debug) console.log('[GamePage] roster players', players.length, players.slice(0, 3))
          } else {
            if (debug) console.warn('[GamePage] roster fetch non-ok', res.status, await res.text())
          }
        } catch (rosterErr) {
          if (debug) console.warn('[GamePage] roster fetch threw', rosterErr)
          // RPC will use its fallback roster
        }
      }

      const rpcParams = { p_room_id: roomId }
      if (players && players.length > 0) rpcParams.p_players = players
      if (debug) console.log('[GamePage] calling generate_card_for_room', { playerCount: players?.length ?? 0, usingRoster: !!rpcParams.p_players })

      let { data, error: rpcError } = await supabase
        .rpc('generate_card_for_room', rpcParams)
        .single()

      if (rpcError && rpcError.message?.toLowerCase().includes('function') && rpcParams.p_players) {
        // Deployed function predates p_players parameter — retry without it.
        // Fix: run the migration in run_all_migrations.sql against your Supabase project.
        if (debug) console.warn('[GamePage] p_players rejected by RPC — retrying without roster', rpcError)
        ;({ data, error: rpcError } = await supabase
          .rpc('generate_card_for_room', { p_room_id: roomId })
          .single())
      }

      if (rpcError) {
        if (debug) console.error('[GamePage] generate_card_for_room failed', rpcError)
        setError(rpcError.message)
        setLoadingCard(false)
        return
      }
      setCard(data)
      setLoadingCard(false)
    }
    loadOrCreateCard()
  }, [roomId, user, authLoading, room?.id])

  const flatSquares = useMemo(() => {
    if (!card?.squares) return []
    return Array.isArray(card.squares[0]) ? card.squares.flat() : card.squares.slice(0, 25)
  }, [card?.squares])

  const isCreator = room?.created_by === user?.id

  const handleStartGame = useCallback(async () => {
    if (!roomId || !isCreator) return
    setError('')
    const { error: e } = await supabase.from('rooms').update({ status: 'live' }).eq('id', roomId)
    if (e) setError(e.message)
  }, [roomId, isCreator])

  const handleEndGame = useCallback(async () => {
    if (!roomId || !isCreator) return
    setError('')
    const { error: e } = await supabase.from('rooms').update({ status: 'finished' }).eq('id', roomId)
    if (e) setError(e.message)
  }, [roomId, isCreator])

  if (loadingRoom || authLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-bg-primary">
        <span className="text-sm text-text-secondary">Loading room...</span>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center bg-bg-primary">
        <span className="text-sm text-accent-red">Room not found.</span>
      </div>
    )
  }

  return (
    <GameRoom
      room={room}
      card={card}
      loadingCard={loadingCard}
      flatSquares={flatSquares}
      user={user}
      roomId={roomId}
      isCreator={isCreator}
      onStartGame={handleStartGame}
      onEndGame={handleEndGame}
      gameStartedNotification={gameStartedNotification}
      error={error}
      leaderboardCards={leaderboardCards}
      chatMessages={chatMessages}
      statEvents={statEvents}
      participantJoined={participantJoined}
      initChatMessages={initChatMessages}
      resetStatEvents={resetStatEvents}
    />
  )
}

export default GamePage
