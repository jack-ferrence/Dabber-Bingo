import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import BingoBoard from './BingoBoard.jsx'
import ShareCard from './ShareCard.jsx'
import SwapModal from './SwapModal.jsx'
import PlayerStatsPanel from './PlayerStatsPanel.jsx'
import Badge from '../ui/Badge.jsx'
import { checkBingo } from '../../game/statProcessor.js'
import { findSwapCandidates } from '../../game/oddsCardGenerator.js'
import { useCountdown } from '../../hooks/useCountdown.js'
import { useProfile } from '../../hooks/useProfile.js'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS } from '../../constants/teamColors.js'

function getRoomTeamColor(abbr, sport) {
  if (!abbr) return 'rgba(255,255,255,0.5)'
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? 'rgba(255,255,255,0.5)'
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? 'rgba(255,255,255,0.5)'
  return NBA_TEAM_COLORS[abbr] ?? 'rgba(255,255,255,0.5)'
}

import { lazyRetry } from '../../lib/lazyRetry.js'

const Leaderboard = lazy(() => lazyRetry(() => import('./Leaderboard.jsx')))
const LiveChat = lazy(() => lazyRetry(() => import('./LiveChat.jsx')))
const CardViewerModal = lazy(() => lazyRetry(() => import('./CardViewerModal.jsx')))

const PanelFallback = () => (
  <div className="flex items-center justify-center p-4">
    <span className="text-[10px] text-text-muted">Loading...</span>
  </div>
)

function GameRoom({
  room,
  card,
  loadingCard,
  flatSquares,
  user,
  roomId,
  isCreator,
  onStartGame,
  onEndGame,
  onCardSwap,
  gameStartedNotification,
  error,
  leaderboardCards,
  chatMessages,
  statEvents,
  participantJoined,
  initChatMessages,
  resetStatEvents,
  rosterPlayers,
  oddsPool = [],
  isLateJoin = false,
  onRetryCard,
}) {
  const navigate = useNavigate()
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [mobileLeaderboardSheet, setMobileLeaderboardSheet] = useState(false)
  const [mobileChatSheet, setMobileChatSheet] = useState(false)
  const [mobileStats, setMobileStats] = useState(false)
  const [activeRooms, setActiveRooms] = useState([])
  const [gamesDropdownOpen, setGamesDropdownOpen] = useState(false)
  const [gameOverDismissed, setGameOverDismissed] = useState(false)
  const [bingoDismissed, setBingoDismissed] = useState(false)
  const [viewingCard, setViewingCard] = useState(null)
  const gamesDropdownRef = useRef(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('room_participants')
      .select('room_id, rooms:room_id(id, name, status, sport, game_id)')
      .eq('user_id', user.id)
      .then(({ data }) => {
        const rooms = data?.map((rp) => rp.rooms).filter((r) => r && (r.status === 'lobby' || r.status === 'live'))
        setActiveRooms(rooms ?? [])
      })
  }, [user])

  useEffect(() => {
    if (!gamesDropdownOpen) return
    const handleClick = (e) => {
      if (gamesDropdownRef.current && !gamesDropdownRef.current.contains(e.target)) {
        setGamesDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [gamesDropdownOpen])

  const bingoResult = useMemo(
    () => (flatSquares.length >= 25 ? checkBingo(card?.squares) : { hasBingo: false, winningLines: [] }),
    [card?.squares, flatSquares.length]
  )

  const winningSquareIds = useMemo(() => {
    const ids = new Set()
    for (const line of bingoResult.winningLines || []) {
      for (const idx of line) {
        const sq = flatSquares[idx]
        if (sq?.id) ids.add(sq.id)
      }
    }
    return Array.from(ids)
  }, [bingoResult.winningLines, flatSquares])

  const playerSquares = useMemo(() => {
    if (!selectedSquare) return []
    return flatSquares.filter(
      (sq) => sq?.player_id === selectedSquare.player_id && sq?.stat_type !== 'free'
    )
  }, [selectedSquare, flatSquares])

  const markedCount = useMemo(
    () => flatSquares.filter((sq) => sq?.marked).length,
    [flatSquares]
  )

  // ── Initial stat events fetch (fills progress bars on first render) ──
  const [initialStatEvents, setInitialStatEvents] = useState([])

  useEffect(() => {
    if (!room?.game_id || room?.status === 'lobby') return
    const fetchInitialStats = async () => {
      const { data } = await supabase
        .from('stat_events')
        .select('player_id, stat_type, value')
        .eq('game_id', room.game_id)
      if (data) setInitialStatEvents(data)
    }
    fetchInitialStats()
  }, [room?.game_id, room?.status])

  const statValueMap = useMemo(() => {
    const map = {}
    // Seed with initial fetch (all existing stats)
    for (const ev of initialStatEvents) {
      const key = `${ev.player_id}:${ev.stat_type}`
      map[key] = Math.max(map[key] ?? 0, Number(ev.value) ?? 0)
    }
    // Overlay with realtime updates (newer values win)
    for (const ev of statEvents ?? []) {
      const key = `${ev.player_id}:${ev.stat_type}`
      map[key] = Math.max(map[key] ?? 0, Number(ev.value) ?? 0)
    }
    return map
  }, [initialStatEvents, statEvents])

  const handleSquareClick = useCallback((sq) => {
    if (sq?.stat_type === 'free') return
    setSelectedSquare((prev) =>
      prev?.player_id === sq?.player_id ? null : sq
    )
    setMobileStats(true)
  }, [])

  const handleCloseStats = useCallback(() => setSelectedSquare(null), [])
  const handleCloseStatsMobile = useCallback(() => {
    setSelectedSquare(null)
    setMobileStats(false)
  }, [])

  // Close mobile stats sheet on Escape key
  useEffect(() => {
    if (!mobileStats) return
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') handleCloseStatsMobile()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [mobileStats, handleCloseStatsMobile])

  // ── Card swap state ─────────────────────────────────────────────────────────
  const [swappingSquareIndex, setSwappingSquareIndex] = useState(null)
  const [swapError, setSwapError] = useState('')
  const [storePromoDismissed, setStorePromoDismissed] = useState(
    () => typeof sessionStorage !== 'undefined' && sessionStorage.getItem('store-promo-dismissed') === '1'
  )
  const handleDismissStorePromo = () => {
    sessionStorage.setItem('store-promo-dismissed', '1')
    setStorePromoDismissed(true)
  }

  const [swapCount, setSwapCount] = useState(0)
  const [swapModalOpen, setSwapModalOpen] = useState(false)
  const [swapTarget, setSwapTarget] = useState(null)

  // Load swap count from dabs_transactions on mount
  useEffect(() => {
    if (!user || !roomId) return
    supabase
      .from('dabs_transactions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('room_id', roomId)
      .eq('reason', 'card_swap')
      .then(({ count }) => { if (count != null) setSwapCount(count) })
  }, [user, roomId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (card?.swap_count != null) setSwapCount(card.swap_count)
  }, [card?.swap_count])

  const handleSwapRequest = useCallback((square, squareIndex) => {
    if (!square || swapCount >= 2) return
    const playerCount = room?.participant_count ?? room?.player_count_at_lock ?? 5
    const candidates = findSwapCandidates(square, oddsPool, flatSquares, 5, playerCount, room?.sport || 'nba')
    setSwapTarget({ square, index: squareIndex, candidates })
    setSwapModalOpen(true)
    setSwapError('')
  }, [oddsPool, flatSquares, swapCount])

  // SwapModal only calls onSwapComplete after a confirmed successful RPC — errors are handled internally.
  const handleSwapComplete = useCallback((newSquare, squareIndex) => {
    setSwapCount((c) => c + 1)
    setSwappingSquareIndex(null)
    setSwapError('')
    onCardSwap?.({ squareIndex, newSquare })
  }, [onCardSwap])


  const handlePlayerClick = useCallback(async (userId, username) => {
    if (userId === user?.id) return
    setViewingCard({ userId, username, squares: null, loading: true })
    const { data } = await supabase
      .from('cards')
      .select('squares, squares_marked, lines_completed')
      .eq('room_id', roomId)
      .eq('user_id', userId)
      .maybeSingle()
    if (data) {
      const flat = Array.isArray(data.squares?.[0]) ? data.squares.flat() : (data.squares ?? [])
      setViewingCard({ userId, username, squares: flat, squaresMarked: data.squares_marked ?? 0, linesCompleted: data.lines_completed ?? 0, loading: false })
    } else {
      setViewingCard({ userId, username, squares: null, loading: false })
    }
  }, [user?.id, roomId])

  const { username: profileUsername, dobsBalance, boardSkin, daubStyle } = useProfile()
  const username = profileUsername
    ?? (user?.is_anonymous ? `Guest_${user.id.slice(0, 8)}` : (user?.email ?? 'Guest'))

  const statusVariant = room?.status === 'live' ? 'success' : room?.status === 'finished' ? 'muted' : 'warning'
  const statusLabel = room?.status === 'live' ? 'Live' : room?.status === 'finished' ? 'Finished' : 'Lobby'

  const countdown = useCountdown(room?.starts_at ?? null)

  // ── Game-over Dobs summary ─────────────────────────────────────────────────
  const dobsSummary = useMemo(() => {
    if (room?.status !== 'finished' || !card) return null

    const squareDobs = (card.squares_marked ?? 0) * 2
    const lineDobs   = (card.lines_completed ?? 0) * 10
    const participation = 3

    const ordinal = (n) => {
      if (n === 1) return '1st'; if (n === 2) return '2nd'; if (n === 3) return '3rd'
      return `${n}th`
    }

    if (isLateJoin) {
      const total = squareDobs + lineDobs + participation
      return { isLateJoin: true, myRank: null, posBonus: 0, squareDobs, lineDobs, participation, total, ordinal, totalPlayers: leaderboardCards.length }
    }

    const eligibleCards = leaderboardCards.filter((c) => !c.late_join)
    const myRank = eligibleCards.length > 0
      ? [...eligibleCards]
          .sort((a, b) =>
            b.lines_completed - a.lines_completed ||
            b.squares_marked - a.squares_marked
          )
          .findIndex((c) => c.user_id === user?.id) + 1
      : 0

    const posBonus = myRank > 0
      ? (myRank === 1 ? 100 : myRank === 2 ? 60 : myRank === 3 ? 40 :
         myRank === 4 ? 25 : myRank === 5 ? 15 : myRank <= 10 ? 5 : 0)
      : 0

    const total = squareDobs + lineDobs + posBonus + participation

    return { isLateJoin: false, myRank, posBonus, squareDobs, lineDobs, participation, total, ordinal, totalPlayers: eligibleCards.length }
  }, [room?.status, card, isLateJoin, leaderboardCards, user?.id])

  const winningLines = bingoResult.winningLines ?? []

  return (
    <div className="game-room-root flex h-[calc(100vh-4rem)] flex-col bg-bg-primary">
      {/* ── Header ── */}
      <header className="game-room-header flex h-12 shrink-0 items-center justify-between px-3 md:px-4" style={{ background: 'rgba(10,10,18,0.98)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}>
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to home"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: '4px 6px', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 6, transition: 'color 120ms ease, background 120ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)'; e.currentTarget.style.background = 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>


          <h1 className="truncate" style={{ fontFamily: 'var(--db-font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '0.03em', color: '#e8e8f4', lineHeight: 1 }}>
            {room?.name || 'Game Room'}
          </h1>
          <Badge variant={statusVariant} pulse={room?.status === 'live'}>
            {statusLabel}
          </Badge>
          {room?.participant_count != null && room?.status === 'lobby' && (
            <span className="hidden text-[10px] text-text-muted sm:inline">
              {room.participant_count} player{room.participant_count === 1 ? '' : 's'}
            </span>
          )}
          {room?.status === 'lobby' && room?.starts_at && (
            <span className="hidden text-[10px] text-text-muted sm:inline">
              {countdown.isExpired
                ? 'Starting soon…'
                : countdown.total < 5 * 60_000
                  ? `Starts in ${countdown.minutes}m ${String(countdown.seconds).padStart(2, '0')}s`
                  : countdown.hours > 0
                    ? `Starts in ${countdown.hours}h ${countdown.minutes}m`
                    : `Starts in ${countdown.minutes}m`}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isCreator && room?.status !== 'finished' && (
            <>
              {room?.status === 'lobby' && (
                <button
                  type="button"
                  onClick={onStartGame}
                  style={{ background: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 6, padding: '4px 12px', fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'background 100ms ease' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.25)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34,197,94,0.15)' }}
                >
                  Start Game
                </button>
              )}
              <button
                type="button"
                onClick={onEndGame}
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 6, padding: '4px 12px', fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.35)', cursor: 'pointer', transition: 'background 100ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              >
                End Game
              </button>
            </>
          )}
          {room?.game_id && (
            <span className="hidden text-[10px] font-mono text-text-muted sm:inline">
              ESPN {room.game_id}
            </span>
          )}
        </div>
      </header>

      {/* ── Live Scoreboard ── */}
      {room?.status === 'live' && (() => {
        const awayAbbr = room.name?.split(' vs ')[0]?.trim() ?? 'AWAY'
        const homeAbbr = room.name?.split(' vs ')[1]?.trim() ?? 'HOME'
        const awayColor = getRoomTeamColor(awayAbbr, room.sport)
        const homeColor = getRoomTeamColor(homeAbbr, room.sport)
        return (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 16,
              padding: '8px 16px',
              background: 'rgba(10,10,18,0.95)',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              flexShrink: 0,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '0.02em', color: awayColor }}>
                {awayAbbr}
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: '#e8e8f4', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {room.away_score ?? 0}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 64 }}>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, fontWeight: 700, color: '#ff6b35', letterSpacing: '0.06em' }}>
                {room.game_status_detail || (room.game_period ? `Q${room.game_period}` : 'PRE')}
              </span>
              {room.game_clock && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.5)', fontVariantNumeric: 'tabular-nums' }}>
                  {room.game_clock}
                </span>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', color: '#e8e8f4', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {room.home_score ?? 0}
              </span>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 16, fontWeight: 800, letterSpacing: '0.02em', color: homeColor }}>
                {homeAbbr}
              </span>
            </div>
          </div>
        )
      })()}

      {/* ── Final Score ── */}
      {room?.status === 'finished' && (room.home_score > 0 || room.away_score > 0) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            padding: '8px 16px',
            background: 'rgba(10,10,18,0.95)',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 15, fontWeight: 800, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.35)' }}>
            {room.name?.split(' vs ')[0]?.trim()}
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {room.away_score}
          </span>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>
            FINAL
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em', color: 'rgba(255,255,255,0.45)', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {room.home_score}
          </span>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 15, fontWeight: 800, letterSpacing: '0.02em', color: 'rgba(255,255,255,0.35)' }}>
            {room.name?.split(' vs ')[1]?.trim()}
          </span>
        </div>
      )}

      {/* ── Notifications ── */}
      {gameStartedNotification && (
        <div className="border-b border-accent-green/30 bg-accent-green/10 px-4 py-2 text-center text-xs font-semibold text-accent-green animate-in-from-top">
          Game Started!
        </div>
      )}
      {error && (
        <div className="border-b border-accent-red/30 bg-accent-red/10 px-4 py-2 text-center text-xs text-accent-red">
          {error}
        </div>
      )}

      {isLateJoin && (
        <div style={{
          background: 'rgba(255,107,53,0.06)',
          borderBottom: '1px solid rgba(255,107,53,0.15)',
          padding: '7px 16px',
          textAlign: 'center',
          flexShrink: 0,
        }}>
          <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.08em', color: '#ff6b35', margin: '0 0 1px' }}>
            LATE JOIN — CASUAL MODE
          </p>
          <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            You&apos;ll earn Dobs for squares &amp; lines, but you won&apos;t appear on the leaderboard or qualify for prizes.
          </p>
        </div>
      )}

      {/* ── Main 3-column area ── */}
      <div className="game-room-main flex flex-1 overflow-hidden">

        {/* LEFT: Bingo Board */}
        <div className={`game-room-board flex shrink-0 flex-col items-center justify-center p-2 md:p-4 gap-3 transition-all duration-200 ${selectedSquare ? 'w-full lg:w-[50%]' : 'w-full lg:w-[65%]'}`} style={{ overflowX: 'visible', overflowY: 'auto' }}>
          {room?.status === 'finished' && !card && !loadingCard ? (
            // Finished game — user didn't have a card
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '40px 0' }}>
              <span style={{ fontSize: 28 }}>🏁</span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#8888aa', letterSpacing: '0.08em' }}>
                GAME FINISHED
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#7777aa', textAlign: 'center', maxWidth: 260, lineHeight: 1.5 }}>
                This game has ended. You didn&apos;t have a card for this game.
              </span>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{ marginTop: 8, background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '10px 20px', cursor: 'pointer' }}
              >
                BACK TO LOBBY
              </button>
            </div>
          ) : loadingCard ? (
            <div style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Loading your card...</div>
          ) : card ? (
            <>
              <BingoBoard
                squares={card.squares}
                winningSquares={winningSquareIds}
                winningLines={winningLines}
                hasBingo={bingoResult.hasBingo}
                onSquareClick={handleSquareClick}
                boardSkin={boardSkin}
                daubStyle={daubStyle}
                isLobby={room?.status === 'lobby'}
                onSwapRequest={handleSwapRequest}
                swappingSquareIndex={swappingSquareIndex}
                swapCount={swapCount}
                oddsPool={oddsPool}
                sport={room?.sport}
                roomStatus={room?.status}
                bingoDismissed={bingoDismissed}
                onBingoDismissed={() => setBingoDismissed(true)}
                statValueMap={statValueMap}
              />

              {/* Swap hint + error (lobby only) */}
              {room?.status === 'lobby' && (
                <div style={{ width: '100%', maxWidth: 512 }}>
                  {swapError && (
                    <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#ff2d2d', marginBottom: 4, textAlign: 'center' }}>
                      {swapError}
                    </p>
                  )}
                  {swapCount < 2 ? (
                    <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      {swapCount === 0
                        ? 'Hold a square to swap · 2 remaining'
                        : 'Hold a square to swap · 1 remaining'}
                    </p>
                  ) : (
                    <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>
                      Max swaps reached (2/2)
                    </p>
                  )}
                </div>
              )}

              {/* Store promo banner (lobby only) */}
              {room?.status === 'lobby' && !storePromoDismissed && (
                <div className="hidden md:flex" style={{ width: '100%', maxWidth: 512, alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '8px 16px' }}>
                  <Link to="/store" style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.3)', textDecoration: 'none', letterSpacing: '0.04em' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b35' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.3)' }}
                  >
                    Customize your look in the Dobs Store →
                  </Link>
                  <button type="button" onClick={handleDismissStorePromo}
                    style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontFamily: 'var(--db-font-ui)', fontSize: 14, padding: '0 0 0 12px', lineHeight: 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.4)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.15)' }}
                  >✕</button>
                </div>
              )}
            </>
          ) : (
            // No card yet — full-board overlay on top of ghost grid
            <div className="relative w-full" style={{ maxWidth: 'min(440px, 100%)' }}>
              {/* Ghost grid underneath */}
              <div
                style={{
                  background: 'linear-gradient(180deg, #0f0f1c 0%, #0a0a14 100%)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 12,
                  padding: 10,
                }}
              >
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7, opacity: 0.18 }}>
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      style={{
                        aspectRatio: '1 / 0.9',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 6,
                        animation: `pulse 1.8s ease-in-out ${(i % 5) * 0.12}s infinite`,
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Overlay */}
              <div
                style={{
                  position: 'absolute', inset: 0, zIndex: 15, borderRadius: 12,
                  background: 'rgba(8,8,18,0.93)', backdropFilter: 'blur(6px)',
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  justifyContent: 'center', padding: 24,
                }}
              >
                <div style={{ textAlign: 'center', maxWidth: 280 }}>
                  {/* Checkmark circle */}
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%',
                    background: 'rgba(34,197,94,0.12)', border: '2px solid rgba(34,197,94,0.3)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 16px',
                  }}>
                    <span style={{ fontSize: 24, color: '#22c55e' }}>✓</span>
                  </div>

                  <h2 style={{ fontFamily: 'var(--db-font-display)', fontSize: 22, fontWeight: 900, letterSpacing: '0.04em', color: '#e0e0f0', margin: '0 0 10px', lineHeight: 1 }}>
                    YOU&apos;RE IN
                  </h2>

                  <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#8888aa', lineHeight: 1.7, margin: '0 0 18px' }}>
                    {room?.status === 'live'
                      ? 'Waiting for game data to load...'
                      : room?.sport === 'mlb'
                        ? 'Your card will be generated once MLB lineups are posted — usually about an hour before first pitch.'
                        : 'Waiting for odds to load. This usually takes a few minutes.'}
                  </p>

                  {/* Game time + player count */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 20 }}>
                    {room?.starts_at && (
                      <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#8888aa', margin: 0 }}>
                        Game starts {new Date(room.starts_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </p>
                    )}
                    {room?.participant_count > 0 && (
                      <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#8888aa', margin: 0 }}>
                        {room.participant_count} player{room.participant_count === 1 ? '' : 's'} joined
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => navigate('/')}
                    style={{
                      background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 4,
                      fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
                      letterSpacing: '0.06em', padding: '11px 0', cursor: 'pointer', width: '100%',
                    }}
                  >
                    BACK TO LOBBY
                  </button>

                  {room?.odds_status === 'ready' && onRetryCard && (
                    <button
                      type="button"
                      onClick={onRetryCard}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        fontFamily: 'var(--db-font-mono)', fontSize: 9,
                        color: '#8888aa', marginTop: 10, textDecoration: 'underline',
                      }}
                    >
                      Odds are available — tap to generate card
                    </button>
                  )}

                  {room?.status === 'live' && onRetryCard && (
                    <button
                      type="button"
                      onClick={onRetryCard}
                      style={{
                        marginTop: 12,
                        background: 'rgba(255,107,53,0.1)',
                        border: '1px solid rgba(255,107,53,0.25)',
                        borderRadius: 6,
                        padding: '8px 20px',
                        fontFamily: 'var(--db-font-mono)',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#ff6b35',
                        cursor: 'pointer',
                      }}
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* CENTER: Player Stats Panel (desktop) */}
        <div
          className={`hidden border-l border-border-subtle transition-all duration-200 ${selectedSquare ? 'lg:flex lg:w-[20%]' : 'lg:w-0'} overflow-hidden`}
        >
          {selectedSquare && (
            <PlayerStatsPanel
              playerId={selectedSquare.player_id}
              playerName={selectedSquare.player_name}
              playerSquares={playerSquares}
              gameId={room?.game_id}
              sport={room?.sport}
              realtimeStatEvents={statEvents}
              resetStatEvents={resetStatEvents}
              onClose={handleCloseStats}
            />
          )}
        </div>

        {/* RIGHT: Leaderboard + Chat (desktop) */}
        <div className="hidden w-[35%] shrink-0 flex-col border-l border-border-subtle lg:flex">
          <div className="flex-[45] min-h-0 overflow-y-auto p-3 scrollbar-thin">
            <Suspense fallback={<PanelFallback />}>
              <Leaderboard
                roomId={roomId}
                currentUserId={user?.id}
                realtimeCards={leaderboardCards}
                participantJoined={participantJoined}
                onPlayerClick={handlePlayerClick}
              />
            </Suspense>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex-[55] min-h-0 overflow-y-auto p-3">
            <Suspense fallback={<PanelFallback />}>
              <LiveChat
                roomId={roomId}
                userId={user?.id}
                username={username}
                realtimeMessages={chatMessages}
                initChatMessages={initChatMessages}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ── Mobile bottom action bar ── */}
      <div className="flex md:hidden items-center justify-between gap-2" style={{
        flexShrink: 0, padding: '12px 16px',
        paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(10,10,18,0.97)', backdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 22, fontWeight: 800, color: '#ff6b35', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
            {markedCount}<span style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)' }}>/25</span>
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            {(bingoResult.winningLines?.length ?? 0)} line{(bingoResult.winningLines?.length ?? 0) !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => setMobileLeaderboardSheet(true)} style={{
            padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 600,
            color: 'rgba(255,255,255,0.55)', cursor: 'pointer', letterSpacing: '0.02em',
          }}>Standings</button>
          <button type="button" onClick={() => setMobileChatSheet(true)} style={{
            padding: '8px 16px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 600,
            color: 'rgba(255,255,255,0.55)', cursor: 'pointer', letterSpacing: '0.02em',
          }}>Chat</button>
        </div>
      </div>

      {/* ── Tablet: below-board panels (md only) ── */}
      <div className="hidden border-t border-border-subtle md:block lg:hidden">
        {selectedSquare && (
          <div className="border-b border-border-subtle">
            <PlayerStatsPanel
              playerId={selectedSquare.player_id}
              playerName={selectedSquare.player_name}
              playerSquares={playerSquares}
              gameId={room?.game_id}
              sport={room?.sport}
              realtimeStatEvents={statEvents}
              resetStatEvents={resetStatEvents}
              onClose={handleCloseStats}
            />
          </div>
        )}
        <div className="grid grid-cols-2 divide-x divide-border-subtle">
          <div className="overflow-y-auto p-3 scrollbar-thin" style={{ maxHeight: '16rem' }}>
            <Suspense fallback={<PanelFallback />}>
              <Leaderboard
                roomId={roomId}
                currentUserId={user?.id}
                realtimeCards={leaderboardCards}
                participantJoined={participantJoined}
                onPlayerClick={handlePlayerClick}
              />
            </Suspense>
          </div>
          <div className="overflow-y-auto p-3" style={{ maxHeight: '16rem' }}>
            <Suspense fallback={<PanelFallback />}>
              <LiveChat
                roomId={roomId}
                userId={user?.id}
                username={username}
                realtimeMessages={chatMessages}
                initChatMessages={initChatMessages}
              />
            </Suspense>
          </div>
        </div>
      </div>

      {/* ── Mobile: PlayerStats bottom sheet ── */}
      {selectedSquare && mobileStats && (
        <div className="md:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            role="presentation"
            aria-hidden="true"
            style={{ background: 'rgba(12, 12, 20, 0.7)' }}
            onClick={handleCloseStatsMobile}
          />
          {/* Bottom sheet */}
          <div
            className="mobile-stats-sheet fixed bottom-0 left-0 right-0 z-50 animate-slide-up"
            role="dialog"
            aria-modal="true"
            aria-label="Player Stats"
            style={{
              background: '#0f0f1c',
              borderTop: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px 14px 0 0',
              height: '60vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', flexShrink: 0 }}>
              <div style={{ width: 32, height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />
            </div>
            <PlayerStatsPanel
              playerId={selectedSquare.player_id}
              playerName={selectedSquare.player_name}
              playerSquares={playerSquares}
              gameId={room?.game_id}
              sport={room?.sport}
              realtimeStatEvents={statEvents}
              resetStatEvents={resetStatEvents}
              onClose={handleCloseStatsMobile}
            />
          </div>
        </div>
      )}

      {/* ── Mobile: Leaderboard bottom sheet ── */}
      {mobileLeaderboardSheet && (
        <div className="md:hidden">
          <div className="fixed inset-0 z-40" role="presentation" aria-hidden="true" style={{ background: 'rgba(6,6,12,0.75)' }} onClick={() => setMobileLeaderboardSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up" role="dialog" aria-modal="true" aria-label="Leaderboard" style={{ background: '#0f0f1c', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px 14px 0 0', height: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 32, height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>STANDINGS</span>
              <button type="button" onClick={() => setMobileLeaderboardSheet(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px 16px' }}>
              <Suspense fallback={<PanelFallback />}>
                <Leaderboard
                  roomId={roomId}
                  currentUserId={user?.id}
                  realtimeCards={leaderboardCards}
                  participantJoined={participantJoined}
                  onPlayerClick={handlePlayerClick}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* ── Mobile: Chat bottom sheet ── */}
      {mobileChatSheet && (
        <div className="md:hidden">
          <div className="fixed inset-0 z-40" role="presentation" aria-hidden="true" style={{ background: 'rgba(6,6,12,0.75)' }} onClick={() => setMobileChatSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up" role="dialog" aria-modal="true" aria-label="Chat" style={{ background: '#0f0f1c', borderTop: '1px solid rgba(255,255,255,0.08)', borderRadius: '14px 14px 0 0', height: '70vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 32, height: 3, background: 'rgba(255,255,255,0.12)', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>CHAT</span>
              <button type="button" onClick={() => setMobileChatSheet(false)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 18, cursor: 'pointer', padding: '4px 8px', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
              <Suspense fallback={<PanelFallback />}>
                <LiveChat
                  roomId={roomId}
                  userId={user?.id}
                  username={username}
                  realtimeMessages={chatMessages}
                  initChatMessages={initChatMessages}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {/* ── Footer ── */}
      <footer className="hidden md:flex" style={{ height: 36, flexShrink: 0, alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.05)', background: 'rgba(10,10,18,0.97)', padding: '0 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{markedCount}</span>/25 marked
          </span>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
            <span style={{ fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{winningLines.length}</span> line{winningLines.length === 1 ? '' : 's'}
          </span>
        </div>
        <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.4)' }}>
          {username}
        </span>
      </footer>

      {/* ── Game Over modal ── */}
      {dobsSummary && !gameOverDismissed && (bingoDismissed || !bingoResult.hasBingo) && (
        <div
          style={{ position: 'fixed', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(5,5,10,0.88)', backdropFilter: 'blur(6px)', padding: 16, zIndex: 100 }}
          role="dialog"
          aria-modal="true"
          aria-label="Game over summary"
          onClick={(e) => { if (e.target === e.currentTarget) setGameOverDismissed(true) }}
        >
          <div
            style={{ position: 'relative', width: '100%', maxWidth: 360, background: 'linear-gradient(160deg, #141420 0%, #0e0e1a 100%)', border: '1px solid rgba(255,107,53,0.2)', borderRadius: 14, padding: '32px 24px 24px', boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.04) inset' }}
          >
            <button
              type="button"
              onClick={() => setGameOverDismissed(true)}
              style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: 4, transition: 'color 120ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.2)' }}
              aria-label="Close"
            >✕</button>

            {/* Rank emoji + title */}
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 44, lineHeight: 1, marginBottom: 12 }}>
                {dobsSummary.isLateJoin ? '🎯' : dobsSummary.myRank === 1 ? '🥇' : dobsSummary.myRank === 2 ? '🥈' : dobsSummary.myRank === 3 ? '🥉' : '🎯'}
              </div>
              <h2 style={{ fontFamily: 'var(--db-font-display)', fontSize: 34, fontWeight: 900, letterSpacing: '0.03em', color: '#e8e8f4', margin: 0, lineHeight: 0.95 }}>
                GAME OVER
              </h2>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.35)', marginTop: 8 }}>
                {dobsSummary.isLateJoin
                  ? 'Casual mode — late join'
                  : dobsSummary.myRank > 0 && dobsSummary.totalPlayers > 0
                    ? `${dobsSummary.ordinal(dobsSummary.myRank)} of ${dobsSummary.totalPlayers} player${dobsSummary.totalPlayers === 1 ? '' : 's'}`
                    : 'Final results'}
              </p>
              {room?.name && (
                <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                  {room.name}
                </p>
              )}
            </div>

            {/* Dobs breakdown */}
            <div style={{ background: 'rgba(255,107,53,0.04)', border: '1px solid rgba(255,107,53,0.1)', borderRadius: 8, padding: '12px 14px', marginBottom: 20 }}>
              {[
                { label: `${card.squares_marked} square${card.squares_marked === 1 ? '' : 's'} × 2`, value: dobsSummary.squareDobs },
                { label: `${card.lines_completed} line${card.lines_completed === 1 ? '' : 's'} × 10`, value: dobsSummary.lineDobs },
                ...(dobsSummary.posBonus > 0 ? [{ label: `${dobsSummary.ordinal(dobsSummary.myRank)} place bonus`, value: dobsSummary.posBonus }] : []),
                { label: 'Participation', value: dobsSummary.participation },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#ff6b35' }}>+{value} ◈</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.06em', color: '#e8e8f4' }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 18, fontWeight: 700, color: '#ff6b35' }}>+{dobsSummary.total} ◈</span>
              </div>
            </div>

            {/* Share card */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
              <ShareCard
                flatSquares={flatSquares}
                markedCount={markedCount}
                linesCount={bingoResult.winningLines?.length ?? 0}
                rank={dobsSummary.myRank}
                totalPlayers={dobsSummary.totalPlayers}
                roomName={room?.name}
                sport={room?.sport}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setGameOverDismissed(true)}
                style={{ flex: 1, fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 600, padding: '11px 0', borderRadius: 8, background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer', transition: 'background 120ms ease, color 120ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; e.currentTarget.style.color = 'rgba(255,255,255,0.8)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.5)' }}
              >
                View board
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{ flex: 1, fontFamily: 'var(--db-font-display)', fontSize: 15, fontWeight: 800, letterSpacing: '0.04em', padding: '11px 0', borderRadius: 8, background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)', color: '#fff', border: 'none', cursor: 'pointer', boxShadow: '0 4px 14px rgba(255,107,53,0.35)', transition: 'opacity 120ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                CONTINUE
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Card Viewer Modal ── */}
      {viewingCard && (
        <Suspense fallback={null}>
          <CardViewerModal
            isOpen={!!viewingCard}
            onClose={() => setViewingCard(null)}
            playerName={viewingCard.username}
            squares={viewingCard.squares}
            squaresMarked={viewingCard.squaresMarked ?? 0}
            linesCompleted={viewingCard.linesCompleted ?? 0}
            loading={viewingCard.loading}
          />
        </Suspense>
      )}

      {/* ── Swap Modal ── */}
      <SwapModal
        isOpen={swapModalOpen}
        onClose={() => setSwapModalOpen(false)}
        currentSquare={swapTarget?.square}
        squareIndex={swapTarget?.index}
        candidates={swapTarget?.candidates ?? []}
        swapCount={swapCount}
        roomId={roomId}
        onSwapComplete={handleSwapComplete}
      />
    </div>
  )
}

export default GameRoom
