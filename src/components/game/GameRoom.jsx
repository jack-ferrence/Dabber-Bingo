import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import BingoBoard from './BingoBoard.jsx'
import SwapModal from './SwapModal.jsx'
import PlayerStatsPanel from './PlayerStatsPanel.jsx'
import Badge from '../ui/Badge.jsx'
import { checkBingo } from '../../game/statProcessor.js'
import { findSwapCandidates } from '../../game/oddsCardGenerator.js'
import { useCountdown } from '../../hooks/useCountdown.js'
import { useProfile } from '../../hooks/useProfile.js'

const Leaderboard = lazy(() => import('./Leaderboard.jsx'))
const LiveChat = lazy(() => import('./LiveChat.jsx'))
const CardViewerModal = lazy(() => import('./CardViewerModal.jsx'))

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

    const myRank = leaderboardCards.length > 0
      ? [...leaderboardCards]
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

    const squareDobs = (card.squares_marked ?? 0) * 2
    const lineDobs   = (card.lines_completed ?? 0) * 10
    const participation = 3
    const total = squareDobs + lineDobs + posBonus + participation

    const ordinal = (n) => {
      if (n === 1) return '1st'; if (n === 2) return '2nd'; if (n === 3) return '3rd'
      return `${n}th`
    }

    return { myRank, posBonus, squareDobs, lineDobs, participation, total, ordinal, totalPlayers: leaderboardCards.length }
  }, [room?.status, card, leaderboardCards, user?.id])

  const winningLines = bingoResult.winningLines ?? []

  return (
    <div className="game-room-root flex h-[calc(100vh-4rem)] flex-col bg-bg-primary">
      {/* ── Header ── */}
      <header className="game-room-header flex h-12 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-secondary px-3 md:px-4">
        <div className="flex items-center gap-3 min-w-0">
          {/* Back button */}
          <button
            type="button"
            onClick={() => navigate('/')}
            aria-label="Back to home"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#555577', padding: '4px 6px', display: 'flex', alignItems: 'center', flexShrink: 0, borderRadius: 4 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0f0'; e.currentTarget.style.background = '#1a1a2e' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#555577'; e.currentTarget.style.background = 'none' }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 3L5 8l5 5" />
            </svg>
          </button>

          {/* Active games dropdown */}
          {activeRooms.length > 1 && (
            <div className="relative" ref={gamesDropdownRef}>
              <button
                type="button"
                onClick={() => setGamesDropdownOpen((v) => !v)}
                style={{ background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 4, padding: '3px 8px', fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#8888aa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ff6b35'; e.currentTarget.style.color = '#e0e0f0' }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#8888aa' }}
              >
                MY GAMES
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 3l3 3 3-3" />
                </svg>
              </button>
              {gamesDropdownOpen && (
                <div
                  className="absolute left-0 top-8 z-50"
                  style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 6, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 200, maxHeight: 280, overflowY: 'auto' }}
                >
                  {activeRooms.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => { navigate(`/room/${r.id}`); setGamesDropdownOpen(false) }}
                      style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontFamily: 'var(--db-font-mono)', fontSize: 12, color: r.id === roomId ? '#ff6b35' : '#8888aa', background: r.id === roomId ? 'rgba(255,107,53,0.08)' : 'none', border: 'none', cursor: 'pointer', borderLeft: r.id === roomId ? '2px solid #ff6b35' : '2px solid transparent' }}
                      onMouseEnter={(e) => { if (r.id !== roomId) { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#e0e0f0' } }}
                      onMouseLeave={(e) => { if (r.id !== roomId) { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8888aa' } }}
                    >
                      <span style={{ display: 'block', marginBottom: 2 }}>{r.name}</span>
                      <span style={{ fontSize: 10, color: r.status === 'live' ? '#ff2d2d' : '#555577' }}>
                        {r.status === 'live' ? '● LIVE' : 'LOBBY'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <h1 className="truncate text-sm font-semibold text-text-primary sm:text-base">
            {room?.name || 'Game Room'}
          </h1>
          <Badge variant={statusVariant} pulse={room?.status === 'live'}>
            {statusLabel}
          </Badge>
          {room?.participant_count != null && !room?.cards_locked && room?.status === 'lobby' && (
            <span className="hidden text-[10px] text-text-muted sm:inline">
              {room.participant_count} player{room.participant_count === 1 ? '' : 's'} — cards lock at T-10
            </span>
          )}
          {room?.cards_locked && room?.player_count_at_lock != null && (
            <span className="hidden text-[10px] text-text-muted sm:inline">
              Locked for {room.player_count_at_lock} player{room.player_count_at_lock === 1 ? '' : 's'}
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
                  style={{ background: '#22c55e', color: '#0c0c14', border: 'none', borderRadius: 4, padding: '4px 12px', fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, cursor: 'pointer', transition: 'background 100ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#16a34a' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#22c55e' }}
                >
                  Start Game
                </button>
              )}
              <button
                type="button"
                onClick={onEndGame}
                className="rounded-md border border-border-active bg-bg-card px-3 py-1 text-[11px] font-medium text-text-secondary hover:bg-bg-hover"
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
      {room?.status === 'live' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '6px 16px',
            background: '#12121e',
            borderBottom: '1px solid #2a2a44',
            fontFamily: 'var(--db-font-mono)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c0c0d8', letterSpacing: '0.06em' }}>
              {room.name?.split(' vs ')[0] ?? 'AWAY'}
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#e0e0f0', fontVariantNumeric: 'tabular-nums' }}>
              {room.away_score ?? 0}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 60 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#ff6b35', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {room.game_status_detail || (room.game_period ? `Q${room.game_period}` : 'PRE')}
            </span>
            {room.game_clock && (
              <span style={{ fontSize: 14, fontWeight: 700, color: '#e0e0f0', fontVariantNumeric: 'tabular-nums' }}>
                {room.game_clock}
              </span>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#e0e0f0', fontVariantNumeric: 'tabular-nums' }}>
              {room.home_score ?? 0}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#c0c0d8', letterSpacing: '0.06em' }}>
              {room.name?.split(' vs ')[1] ?? 'HOME'}
            </span>
          </div>
        </div>
      )}

      {/* ── Final Score ── */}
      {room?.status === 'finished' && (room.home_score > 0 || room.away_score > 0) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 16,
            padding: '6px 16px',
            background: '#12121e',
            borderBottom: '1px solid #2a2a44',
            fontFamily: 'var(--db-font-mono)',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: '#555577' }}>
            {room.name?.split(' vs ')[0]} {room.away_score}
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, color: '#555577', letterSpacing: '0.1em' }}>
            FINAL
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: '#555577' }}>
            {room.home_score} {room.name?.split(' vs ')[1]}
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


      {/* ── Main 3-column area ── */}
      <div className="game-room-main flex flex-1 overflow-hidden">

        {/* LEFT: Bingo Board */}
        <div className={`game-room-board flex shrink-0 flex-col items-center justify-center overflow-y-auto p-2 md:p-4 gap-3 transition-all duration-200 ${selectedSquare ? 'w-full lg:w-[45%]' : 'w-full lg:w-[65%]'}`}>
          {loadingCard ? (
            <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577' }}>Loading your card...</div>
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
                    <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#3a3a55', textAlign: 'center', letterSpacing: '0.04em' }}>
                      {swapCount === 0
                        ? 'HOLD A SQUARE TO SWAP · 2 LEFT'
                        : 'HOLD A SQUARE TO SWAP · 1 LEFT'}
                    </p>
                  ) : (
                    <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', textAlign: 'center', letterSpacing: '0.04em' }}>
                      Max swaps reached (2/2)
                    </p>
                  )}
                </div>
              )}

              {/* Store promo banner (lobby only) */}
              {room?.status === 'lobby' && !storePromoDismissed && (
                <div className="hidden md:flex" style={{ width: '100%', maxWidth: 512, alignItems: 'center', justifyContent: 'space-between', background: '#12121e', border: '1px solid #2a2a44', borderRadius: 4, padding: '8px 16px' }}>
                  <Link to="/store" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', textDecoration: 'none', letterSpacing: '0.04em' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b35' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#8888aa' }}
                  >
                    CUSTOMIZE YOUR LOOK IN THE DOBS STORE →
                  </Link>
                  <button type="button" onClick={handleDismissStorePromo}
                    style={{ background: 'none', border: 'none', color: '#3a3a55', cursor: 'pointer', fontFamily: 'var(--db-font-mono)', fontSize: 12, padding: '0 0 0 12px', lineHeight: 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#555577' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#3a3a55' }}
                  >✕</button>
                </div>
              )}
            </>
          ) : room?.odds_status === 'pending' ? (
            // Animated grid placeholder — odds are being built server-side
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: '100%', maxWidth: 512 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4, width: '100%', opacity: 0.35 }}>
                {Array.from({ length: 25 }).map((_, i) => (
                  <div
                    key={i}
                    style={{
                      aspectRatio: '1',
                      background: '#1a1a2e',
                      border: '1px solid #2a2a44',
                      borderRadius: 4,
                      animation: `pulse 1.8s ease-in-out ${(i % 5) * 0.12}s infinite`,
                    }}
                  />
                ))}
              </div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', letterSpacing: '0.08em' }}>
                BUILDING YOUR CARD...
              </span>
            </div>
          ) : room?.odds_status === 'insufficient' ? (
            // Not enough props — show informative state + soft retry
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 28 }}>📊</span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', letterSpacing: '0.08em' }}>
                NOT ENOUGH PROPS YET
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#3a3a55', textAlign: 'center', maxWidth: 260 }}>
                Props for this game aren't available yet. Check back closer to tip-off.
              </span>
              {onRetryCard && (
                <button
                  type="button"
                  onClick={onRetryCard}
                  style={{ background: 'none', color: '#555577', border: '1px solid #2a2a44', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '6px 16px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a3a55'; e.currentTarget.style.color = '#8888aa' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#555577' }}
                >
                  CHECK AGAIN
                </button>
              )}
            </div>
          ) : (
            // Generic failure — error banner above already shows the reason;
            // only show retry button when there's no hard error to act on.
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {!error && <span style={{ fontSize: 28 }}>🎯</span>}
              {!error && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577', textAlign: 'center', maxWidth: 300 }}>
                  Couldn&apos;t generate your card.
                </span>
              )}
              {onRetryCard && !error && (
                <button
                  type="button"
                  onClick={onRetryCard}
                  style={{ background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '6px 16px', cursor: 'pointer' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#ff8855' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#ff6b35' }}
                >
                  TRY AGAIN
                </button>
              )}
            </div>
          )}
        </div>

        {/* Mobile floating action buttons */}
        <div className="flex md:hidden items-center justify-center gap-3" style={{ marginTop: 8, marginBottom: 4 }}>
          <button
            type="button"
            onClick={() => setMobileLeaderboardSheet(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 6, fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#8888aa', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20V10M6 20v-4M18 20v-8" />
            </svg>
            STANDINGS
          </button>
          <button
            type="button"
            onClick={() => setMobileChatSheet(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 6, fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#8888aa', letterSpacing: '0.08em', cursor: 'pointer' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
            </svg>
            CHAT
          </button>
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
              background: '#12121e',
              borderRadius: '12px 12px 0 0',
              height: '60vh',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Drag handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 6px', flexShrink: 0 }}>
              <div style={{ width: 32, height: 4, background: '#2a2a44', borderRadius: 2 }} />
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
          <div className="fixed inset-0 z-40" role="presentation" aria-hidden="true" style={{ background: 'rgba(12, 12, 20, 0.7)' }} onClick={() => setMobileLeaderboardSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up" role="dialog" aria-modal="true" aria-label="Leaderboard" style={{ background: '#12121e', borderRadius: '12px 12px 0 0', height: '55vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 32, height: 4, background: '#2a2a44', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: '#555577', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Leaderboard</span>
              <button type="button" onClick={() => setMobileLeaderboardSheet(false)} style={{ background: 'none', border: 'none', color: '#555577', fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
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
          <div className="fixed inset-0 z-40" role="presentation" aria-hidden="true" style={{ background: 'rgba(12, 12, 20, 0.7)' }} onClick={() => setMobileChatSheet(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up" role="dialog" aria-modal="true" aria-label="Chat" style={{ background: '#12121e', borderRadius: '12px 12px 0 0', height: '65vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px', flexShrink: 0 }}>
              <div style={{ width: 32, height: 4, background: '#2a2a44', borderRadius: 2 }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px 8px', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: '#555577', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Chat</span>
              <button type="button" onClick={() => setMobileChatSheet(false)} style={{ background: 'none', border: 'none', color: '#555577', fontSize: 18, cursor: 'pointer', padding: '4px 8px' }}>✕</button>
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
      <footer className="flex h-8 md:h-10 shrink-0 items-center justify-between border-t border-border-subtle bg-bg-secondary px-3 md:px-4">
        <div className="flex items-center gap-4 text-[10px] md:text-[11px] text-text-muted">
          <span>
            <span className="font-semibold text-text-primary">{markedCount}</span>/25 marked
          </span>
          <span>
            <span className="font-semibold text-text-primary">{winningLines.length}</span> line{winningLines.length === 1 ? '' : 's'}
          </span>
        </div>
        <span className="text-[11px] text-text-muted">
          {username}
        </span>
      </footer>

      {/* ── Game Over modal ── */}
      {dobsSummary && !gameOverDismissed && (
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/85 p-4"
          style={{ zIndex: 100 }}
          role="dialog"
          aria-modal="true"
          aria-label="Game over summary"
          onClick={(e) => { if (e.target === e.currentTarget) setGameOverDismissed(true) }}
        >
          <div
            className="machine-glow w-full max-w-sm"
            style={{ position: 'relative', background: '#12121e', border: '1px solid rgba(255,107,53,0.35)', borderRadius: 10, padding: '28px 24px 24px' }}
          >
            <button
              type="button"
              onClick={() => setGameOverDismissed(true)}
              style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#555577', cursor: 'pointer', fontFamily: 'var(--db-font-mono)', fontSize: 16, lineHeight: 1, padding: 4 }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0f0' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
              aria-label="Close"
            >✕</button>

            {/* Rank emoji + title */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 48, lineHeight: 1, marginBottom: 10 }}>
                {dobsSummary.myRank === 1 ? '🥇' : dobsSummary.myRank === 2 ? '🥈' : dobsSummary.myRank === 3 ? '🥉' : '🎯'}
              </div>
              <h2 style={{ fontFamily: 'var(--db-font-display)', fontSize: 22, fontWeight: 800, letterSpacing: '0.06em', color: '#e0e0f0', margin: 0 }}>
                GAME OVER
              </h2>
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', marginTop: 6, letterSpacing: '0.05em' }}>
                {dobsSummary.myRank > 0 && dobsSummary.totalPlayers > 0
                  ? `${dobsSummary.ordinal(dobsSummary.myRank)} of ${dobsSummary.totalPlayers} player${dobsSummary.totalPlayers === 1 ? '' : 's'}`
                  : 'Final results'}
              </p>
              {room?.name && (
                <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#3a3a55', marginTop: 3, letterSpacing: '0.04em' }}>
                  {room.name}
                </p>
              )}
            </div>

            {/* Dobs breakdown */}
            <div style={{ background: 'rgba(255,107,53,0.05)', border: '1px solid rgba(255,107,53,0.12)', borderRadius: 6, padding: '12px 14px', marginBottom: 20 }}>
              {[
                { label: `${card.squares_marked} square${card.squares_marked === 1 ? '' : 's'} × 2`, value: dobsSummary.squareDobs },
                { label: `${card.lines_completed} line${card.lines_completed === 1 ? '' : 's'} × 10`, value: dobsSummary.lineDobs },
                ...(dobsSummary.posBonus > 0 ? [{ label: `${dobsSummary.ordinal(dobsSummary.myRank)} place bonus`, value: dobsSummary.posBonus }] : []),
                { label: 'Participation', value: dobsSummary.participation },
              ].map(({ label, value }) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 7, marginBottom: 7, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', letterSpacing: '0.03em' }}>{label}</span>
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#ff6b35' }}>+{value} ◈</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 4 }}>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#e0e0f0', letterSpacing: '0.04em' }}>TOTAL</span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 15, fontWeight: 800, color: '#ff6b35' }}>+{dobsSummary.total} ◈</span>
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={() => setGameOverDismissed(true)}
                style={{ flex: 1, fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '10px 0', borderRadius: 4, background: 'rgba(255,107,53,0.10)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.25)', cursor: 'pointer', transition: 'background 0.1s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.18)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.10)' }}
              >
                VIEW BOARD
              </button>
              <button
                type="button"
                onClick={() => navigate('/')}
                style={{ flex: 1, fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '10px 0', borderRadius: 4, background: '#ff6b35', color: '#0c0c14', border: 'none', cursor: 'pointer', transition: 'background 0.1s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#ff8855' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#ff6b35' }}
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
