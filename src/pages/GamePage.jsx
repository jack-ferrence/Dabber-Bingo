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
  const [isLateJoin, setIsLateJoin] = useState(false)
  const [gameStartedNotification, setGameStartedNotification] = useState(false)
  const prevStatusRef = useRef(null)

  // Auto-retry when room goes live and we have no card (e.g. MLB lineup just became available)
  useEffect(() => {
    if (room?.status === 'live' && !card && !loadingCard && room?.odds_status !== 'ready') {
      const timer = setTimeout(() => {
        setRetryCount((c) => c + 1)
      }, 30_000)
      return () => clearTimeout(timer)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, card, loadingCard, room?.odds_status])

  // Re-fetch full room when odds become ready — realtime patch may not include odds_pool
  useEffect(() => {
    if (room?.odds_status === 'ready' && !card && !loadingCard) {
      const refetch = async () => {
        const { data } = await supabase
          .from('rooms_with_counts')
          .select('*')
          .eq('id', roomId)
          .maybeSingle()
        if (data) {
          setRoom(data)
          setRetryCount((c) => c + 1)
        }
      }
      refetch()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.odds_status])

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

  // Reset all game-specific state when switching rooms so the old card
  // never shows while the new room/card is loading
  useEffect(() => {
    setRoom(null)
    setCard(null)
    setRosterPlayers(null)
    setOddsPool([])
    setError('')
    setRetryCount(0)
    setLoadingRoom(true)
    setLoadingCard(true)
    setIsLateJoin(false)
    setGameStartedNotification(false)
    prevStatusRef.current = null
  }, [roomId])

  // Load room
  useEffect(() => {
    if (!roomId) return
    const loadRoom = async () => {
      setLoadingRoom(true)
      setError('')
      const { data, error: roomError } = await supabase
        .from('rooms_with_counts')
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

      // ── Auto-join: insert participant row if not already joined ─────────────
      try {
        await supabase
          .from('room_participants')
          .upsert(
            { room_id: roomId, user_id: user.id },
            { onConflict: 'room_id,user_id', ignoreDuplicates: true }
          )
      } catch (joinErr) {
        if (debug) console.warn('[GamePage] auto-join failed:', joinErr.message)
      }

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

      // ── Late join detection (no hard block — casual mode instead) ───────────
      let lateJoin = false
      if (!cardAlreadyExists && room.status === 'live') {
        const sport = room.sport || 'nba'
        const period = room.game_period ?? 0
        const clock = room.game_clock ?? ''

        if (sport === 'nba') {
          lateJoin = period > 1
        } else if (sport === 'ncaa') {
          if (period > 1) {
            lateJoin = true
          } else {
            const mins = parseInt(clock.split(':')[0], 10)
            lateJoin = !isNaN(mins) && mins < 10
          }
        } else if (sport === 'mlb') {
          lateJoin = period > 3
        }
      }

      // ── Step 2: Get odds pool from room (server-managed by refresh-odds) ──────
      const roomOddsPool = room.odds_pool ?? []

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

      // ── Step 2b: Featured game entry check ───────────────────────────────────
      if (!cardAlreadyExists) {
        const { data: linkedFeatured } = await supabase
          .from('featured_games')
          .select('id, entry_fee, free_entry, status')
          .eq('room_id', roomId)
          .in('status', ['active', 'live'])
          .maybeSingle()

        if (linkedFeatured) {
          const { data: existingEntry } = await supabase
            .from('featured_entries')
            .select('id')
            .eq('featured_game_id', linkedFeatured.id)
            .eq('user_id', user.id)
            .maybeSingle()

          if (!existingEntry) {
            setError('This is a Featured Game — enter from the lobby banner first.')
            setLoadingCard(false)
            return
          }
        }
      }

      // ── Step 3: Generate card from server-managed odds pool ───────────────────
      // Live rooms: the pool was locked in when the game went live — skip odds_status check
      // Lobby rooms: wait for odds_status === 'ready' before generating

      // If live room has no odds, try re-fetching once before giving up
      if (room.status === 'live' && roomOddsPool.length < MIN_PROPS_FOR_CARD && retryCount === 0) {
        const { data: freshRoom } = await supabase
          .from('rooms')
          .select('odds_pool, odds_status')
          .eq('id', roomId)
          .maybeSingle()
        if (freshRoom?.odds_pool?.length >= MIN_PROPS_FOR_CARD) {
          setOddsPool(freshRoom.odds_pool)
          setRetryCount(1)
          return // Will re-run the effect with the new odds pool
        }
      }

      const oddsReady = room.status === 'live'
        ? roomOddsPool.length >= MIN_PROPS_FOR_CARD
        : room.odds_status === 'ready' && roomOddsPool.length >= MIN_PROPS_FOR_CARD

      if (!oddsReady) {
        // For live games with no odds pool, show an error instead of the
        // "waiting for lineups" screen — the lineups aren't coming.
        if (room.status === 'live') {
          setError('This game started before odds were loaded. No card available — try another game.')
        }
        setLoadingCard(false)
        return
      }

      try {
        // Use participant count for band-based difficulty scaling
        const playerCount = room.participant_count ?? room.player_count_at_lock ?? 1
        const oddsCard = generateOddsBasedCard(roomOddsPool, playerCount, room.sport || 'nba')
        if (oddsCard) {
          const { data: savedCard, error: saveError } = await supabase
            .from('cards')
            .insert({ room_id: roomId, user_id: user.id, squares: oddsCard, late_join: lateJoin })
            .select()
            .maybeSingle()

          if (!saveError && savedCard) {
            if (debug) console.log('[GamePage] odds-based card saved', savedCard.id)
            setIsLateJoin(lateJoin)
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

        // Card generation failed — GameRoom fallback handles the UI
        setLoadingCard(false)
      } catch (cardErr) {
        if (debug) console.error('[GamePage] card generation threw', cardErr)
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
        <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>Loading room...</span>
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
      isLateJoin={isLateJoin}
      onRetryCard={() => { setCard(null); setRetryCount((c) => c + 1) }}
    />
  )
}

export default GamePage
