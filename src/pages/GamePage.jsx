import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useRoomChannel } from '../hooks/useRoomChannel.js'
import GameRoom from '../components/game/GameRoom.jsx'
import { matchOddsToRoster, generateOddsBasedCard } from '../game/oddsCardGenerator.js'

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

      // ── Step 1: Check if card already exists ────────────────────────────────
      try {
        const { data: existingCard } = await supabase
          .from('cards')
          .select('*')
          .eq('room_id', roomId)
          .eq('user_id', user.id)
          .maybeSingle()
        if (existingCard) {
          setCard(existingCard)
          setLoadingCard(false)
          return
        }
      } catch (e) {
        if (debug) console.warn('[GamePage] existing card check threw', e)
        // Non-fatal — proceed to generation
      }

      // ── Step 2: Charge entry fee (no-op if already joined or NCAA) ──────────
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
            setError(`Not enough Dabs! You need 10 but only have ${feeResult.balance}. Play more games to earn Dabs.`)
          } else if (feeResult.reason !== 'already_joined' && feeResult.reason !== 'free_entry') {
            setError('Could not join: ' + feeResult.reason)
          }
          if (feeResult.reason === 'insufficient_dabs') {
            setLoadingCard(false)
            return
          }
        }
      } catch (feeErr) {
        if (debug) console.warn('[GamePage] deduct_entry_fee threw', feeErr)
      }

      // ── Step 3: Fetch roster ─────────────────────────────────────────────────
      let players = null
      let rosterTeams = []
      if (room.game_id) {
        try {
          const rosterUrl = `/.netlify/functions/get-roster?game_id=${room.game_id}&sport=${room.sport || 'nba'}`
          const res = await fetch(rosterUrl)
          if (res.ok) {
            const roster = await res.json()
            players = (roster.players ?? []).map((p) => ({
              id: p.id,
              name: p.name,
              lastName: p.lastName,
              team: p.team,
            }))
            setRosterPlayers(players)
            // Extract unique team names for odds lookup
            const teams = [...new Set(players.map((p) => p.team).filter(Boolean))]
            rosterTeams = teams
          } else if (debug) {
            console.warn('[GamePage] roster fetch non-ok', res.status)
          }
        } catch (rosterErr) {
          if (debug) console.warn('[GamePage] roster fetch threw', rosterErr)
        }
      }

      // ── Step 4: Fetch odds (NBA only, best-effort) ───────────────────────────
      let oddsProps = null
      if (room.sport !== 'ncaa' && rosterTeams.length >= 2) {
        try {
          const homeTeam = encodeURIComponent(rosterTeams[0])
          const awayTeam = encodeURIComponent(rosterTeams[1])
          const oddsUrl = `/.netlify/functions/get-odds?home_team=${homeTeam}&away_team=${awayTeam}`
          const res = await fetch(oddsUrl)
          if (res.ok) {
            const oddsData = await res.json()
            if (oddsData.props?.length > 0) {
              oddsProps = oddsData.props
              if (debug) console.log(`[GamePage] odds: ${oddsProps.length} props for ${oddsData.meta?.home_team} vs ${oddsData.meta?.away_team}`)
            } else if (debug) {
              console.warn('[GamePage] odds empty — reason:', oddsData.meta?.reason ?? 'no props returned', oddsData.meta)
            }
          }
        } catch (oddsErr) {
          if (debug) console.warn('[GamePage] odds fetch threw', oddsErr)
        }
      }

      // ── Step 5: Try odds-based card generation ───────────────────────────────
      if (oddsProps && players) {
        try {
          const matched = matchOddsToRoster(oddsProps, players)
          setOddsPool(matched)
          const oddsCard = generateOddsBasedCard(matched)
          if (oddsCard) {
            // Save the client-generated card to the database
            const { data: savedCard, error: saveError } = await supabase
              .from('cards')
              .insert({ room_id: roomId, user_id: user.id, squares: oddsCard })
              .select()
              .maybeSingle()

            if (!saveError && savedCard) {
              if (debug) console.log('[GamePage] odds-based card saved', savedCard.id)
              setCard(savedCard)
              setLoadingCard(false)
              return
            }
            if (debug) console.warn('[GamePage] card save failed, using in-memory', saveError?.message)
            // Use card in-memory if save failed (will regenerate on refresh)
            setCard({ room_id: roomId, user_id: user.id, squares: oddsCard })
            setLoadingCard(false)
            return
          }
          if (debug) console.warn('[GamePage] generateOddsBasedCard returned null, falling back to RPC')
        } catch (oddsCardErr) {
          if (debug) console.warn('[GamePage] odds card generation threw', oddsCardErr)
        }
      }

      // ── Step 6: Fallback to generate_card_for_room RPC ──────────────────────
      try {
        const rpcParams = { p_room_id: roomId }
        if (players && players.length > 0) rpcParams.p_players = players

        let { data, error: rpcError } = await supabase
          .rpc('generate_card_for_room', rpcParams)
          .maybeSingle()

        if (rpcError && rpcParams.p_players && (
          rpcError.code === 'PGRST202' ||
          rpcError.message?.toLowerCase().includes('function') ||
          rpcError.message?.includes('p_players')
        )) {
          if (debug) console.warn('[GamePage] p_players rejected by RPC, retrying without roster')
          ;({ data, error: rpcError } = await supabase
            .rpc('generate_card_for_room', { p_room_id: roomId })
            .maybeSingle())
        }

        if (rpcError) {
          if (debug) console.error('[GamePage] generate_card_for_room failed', rpcError)
          setError(rpcError.message || 'Failed to generate card')
          setLoadingCard(false)
          return
        }

        setCard(data ?? null)
        setLoadingCard(false)
      } catch (cardErr) {
        if (debug) console.error('[GamePage] card generation threw', cardErr)
        setError('Connection error generating card. Please try again.')
        setLoadingCard(false)
      }
    }
    loadOrCreateCard()
  }, [roomId, user, authLoading, room?.id, retryCount])

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
