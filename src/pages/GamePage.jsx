import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRoomChannel } from '../hooks/useRoomChannel.js'
import GameRoom from '../components/game/GameRoom.jsx'
import { generateOddsBasedCard } from '../game/oddsCardGenerator.js'

const MIN_PROPS_FOR_CARD = 24

function GamePage() {
  const { roomId } = useParams()
  const { user, loading: authLoading } = useAuth()

  const [room, setRoom] = useState(null)
  const [card, setCard] = useState(null)
  const [rosterPlayers, setRosterPlayers] = useState(null)
  const [oddsPool, setOddsPool] = useState([])
  const [retryCount, setRetryCount] = useState(0)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRoom((prev) => (prev ? { ...prev, ...roomPatch } : prev))
  }, [roomPatch])

  // Apply card patches from the consolidated channel
  useEffect(() => {
    if (!cardPatch) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

      // ── Step 1: Check if card already exists ────────────────────────────────
      let existingCard = null
      let cardAlreadyExists = false
      try {
        const { data } = await supabase
          .from('cards')
          .select('*')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .maybeSingle()
        existingCard = data
      } catch (e) {
        if (debug) console.warn('[GamePage] existing card check threw', e)
        // Non-fatal — proceed to generation
      }

      if (existingCard) {
        setCard(existingCard)
        setLoadingCard(false)
        cardAlreadyExists = true
        // DON'T return — continue to fetch roster + odds for display and swaps
      }

      // ── Late entry check for live games ─────────────────────────────────────
      if (!cardAlreadyExists && room.status === 'live') {
        const sport = room.sport || 'nba'
        const period = room.game_period ?? 0
        const clock = room.game_clock ?? ''
        let lateEntryAllowed = false

        if (sport === 'nba') {
          lateEntryAllowed = period <= 1
        } else if (sport === 'ncaa') {
          if (period <= 1) {
            const mins = parseInt(clock.split(':')[0], 10)
            lateEntryAllowed = !isNaN(mins) && mins >= 10
          }
        }

        if (!lateEntryAllowed) {
          setError('Late entry is closed for this game. You can join the next game from the lobby.')
          setLoadingCard(false)
          return
        }
      }

      // ── Step 2: Charge entry fee (skip for returning users) ─────────────────
      if (!cardAlreadyExists) {
        try {
          const { data: feeResult, error: feeError } = await supabase.rpc('deduct_entry_fee', {
            p_user_id: user.id,
            p_room_id: roomId,
          })

          if (feeError) {
            const missing = feeError.code === 'PGRST202' || feeError.code === '42883' ||
              feeError.message?.toLowerCase().includes('function')
            if (!missing) {
              setError('Failed to process entry fee: ' + feeError.message)
              setLoadingCard(false)
              return
            }
            if (debug) console.warn('[GamePage] deduct_entry_fee not found, skipping', feeError.message)
          } else if (feeResult && !feeResult.success) {
            if (feeResult.reason === 'insufficient_dabs') {
              setError(`Not enough Dobs! You need 10 but only have ${feeResult.balance}. Play more games to earn Dobs.`)
              setLoadingCard(false)
              return
            } else if (feeResult.reason === 'profile_not_found') {
              setError('Profile not found. Try logging out and back in.')
              setLoadingCard(false)
              return
            } else {
              setError('Could not join: ' + feeResult.reason)
              setLoadingCard(false)
              return
            }
          }
          // already_charged and march_madness_free are expected — continue silently
        } catch (feeErr) {
          if (debug) console.warn('[GamePage] deduct_entry_fee threw', feeErr)
        }
      }

      // ── Step 3: Get odds pool from room (server-managed by refresh-odds) ──────
      const roomOddsPool = room.odds_pool ?? []
      const oddsReady    = room.odds_status === 'ready' && roomOddsPool.length >= MIN_PROPS_FOR_CARD

      if (roomOddsPool.length > 0) {
        setOddsPool(roomOddsPool)
      }

      // Returning users: odds pool now set for swaps — done
      if (cardAlreadyExists) {
        // Kick off roster fetch for PlayerStatsPanel in the background
        if (room.game_id) {
          fetch(`/.netlify/functions/get-roster?game_id=${room.game_id}&sport=${room.sport || 'nba'}`)
            .then(res => res.ok ? res.json() : null)
            .then(roster => { if (roster?.players) setRosterPlayers(roster.players.map(p => ({ id: p.id, name: p.name, lastName: p.lastName, team: p.team }))) })
            .catch(() => {})
        }
        return
      }

      // ── Step 4: Generate card from server-managed odds pool ───────────────────
      if (!oddsReady) {
        if (room.odds_status === 'insufficient') {
          setError("Not enough player props available for this game. Try a different game.")
        } else {
          // odds_status is 'pending' — refresh-odds will populate within a few minutes
          // The useEffect re-runs automatically when room.odds_status changes to 'ready'
          setError('Odds are being loaded for this game. Check back in a minute or two.')
        }
        setLoadingCard(false)
        return
      }

      try {
        const oddsCard = generateOddsBasedCard(roomOddsPool)
        if (oddsCard) {
          const { data: savedCard, error: saveError } = await supabase
            .from('cards')
            .insert({ room_id: roomId, user_id: user.id, squares: oddsCard })
            .select()
            .maybeSingle()

          if (!saveError && savedCard) {
            if (debug) console.log('[GamePage] odds-based card saved', savedCard.id)
            setCard(savedCard)
            setLoadingCard(false)
            // Kick off roster fetch for PlayerStatsPanel in the background
            if (room.game_id) {
              fetch(`/.netlify/functions/get-roster?game_id=${room.game_id}&sport=${room.sport || 'nba'}`)
                .then(res => res.ok ? res.json() : null)
                .then(roster => { if (roster?.players) setRosterPlayers(roster.players.map(p => ({ id: p.id, name: p.name, lastName: p.lastName, team: p.team }))) })
                .catch(() => {})
            }
            return
          }
          if (debug) console.warn('[GamePage] card save failed, using in-memory', saveError?.message)
          setCard({ room_id: roomId, user_id: user.id, squares: oddsCard })
          setLoadingCard(false)
          return
        }

        setError('Unable to generate a card with the available odds. Try again shortly.')
        setLoadingCard(false)
      } catch (cardErr) {
        if (debug) console.error('[GamePage] card generation threw', cardErr)
        setError('Error generating card. Please try again.')
        setLoadingCard(false)
      }
    }
    loadOrCreateCard()
  }, [roomId, user, authLoading, room?.id, room?.odds_status, retryCount])

  const flatSquares = useMemo(() => {
    if (!card?.squares) return []
    return Array.isArray(card.squares[0]) ? card.squares.flat() : card.squares.slice(0, 25)
  }, [card])

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

  const handleCardSwap = useCallback((update) => {
    if (update && typeof update.squareIndex === 'number' && update.newSquare) {
      // Partial update from swap RPC: replace one square
      setCard((prev) => {
        if (!prev?.squares) return prev
        const flat = Array.isArray(prev.squares[0]) ? prev.squares.flat() : [...prev.squares]
        flat[update.squareIndex] = update.newSquare
        return { ...prev, squares: flat }
      })
    } else {
      // Full card replacement (legacy)
      setCard(update)
    }
  }, [])

  if (loadingRoom || authLoading) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center" style={{ background: '#0c0c14' }}>
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: '#8888aa' }}>Loading room...</span>
      </div>
    )
  }

  if (!room) {
    return (
      <div className="flex h-[calc(100vh-4rem)] items-center justify-center" style={{ background: '#0c0c14' }}>
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: '#ff2d2d' }}>Room not found.</span>
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
      onCardSwap={handleCardSwap}
      gameStartedNotification={gameStartedNotification}
      error={error}
      leaderboardCards={leaderboardCards}
      chatMessages={chatMessages}
      statEvents={statEvents}
      participantJoined={participantJoined}
      initChatMessages={initChatMessages}
      resetStatEvents={resetStatEvents}
      rosterPlayers={rosterPlayers}
      oddsPool={oddsPool}
      onRetryCard={() => { setCard(null); setRetryCount((c) => c + 1) }}
    />
  )
}

export default GamePage
