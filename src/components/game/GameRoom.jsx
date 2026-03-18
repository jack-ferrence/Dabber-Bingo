import { lazy, Suspense, useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import BingoBoard from './BingoBoard.jsx'
import PlayerStatsPanel from './PlayerStatsPanel.jsx'
import Badge from '../ui/Badge.jsx'
import { checkBingo } from '../../game/statProcessor.js'
import { useCountdown } from '../../hooks/useCountdown.js'
import { useProfile } from '../../hooks/useProfile.js'

const Leaderboard = lazy(() => import('./Leaderboard.jsx'))
const LiveChat = lazy(() => import('./LiveChat.jsx'))

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
  const [mobileChat, setMobileChat] = useState(false)
  const [mobileLeaderboard, setMobileLeaderboard] = useState(false)
  const [mobileStats, setMobileStats] = useState(false)
  const [activeRooms, setActiveRooms] = useState([])
  const [gamesDropdownOpen, setGamesDropdownOpen] = useState(false)
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

  useEffect(() => {
    if (card?.swap_count != null) setSwapCount(card.swap_count)
  }, [card?.swap_count])

  const handleSwapRequest = useCallback(async (squareIndex, newSquare = null) => {
    setSwappingSquareIndex(squareIndex)
    setSwapError('')
    const { data: result, error: rpcError } = await supabase.rpc('swap_card_square', {
      p_room_id: roomId,
      p_square_index: squareIndex,
      p_roster: rosterPlayers ?? null,
      p_new_square: newSquare ?? null,
    })
    setSwappingSquareIndex(null)
    if (rpcError) {
      setSwapError(rpcError.message)
      return
    }
    if (!result?.success) {
      const reason = result?.reason
      if (reason === 'insufficient_dabs') setSwapError(`Need ${result.cost ?? (swapCount === 0 ? 10 : 50)} Dabs (have ${result.balance ?? 0})`)
      else if (reason === 'game_already_started') setSwapError('Too late — game is live!')
      else if (reason === 'max_swaps_reached') setSwapError('Max 2 swaps per game reached')
      else setSwapError(reason || 'Swap failed')
      return
    }
    if (result.swap_count != null) {
      setSwapCount(result.swap_count)
    } else {
      setSwapCount((c) => c + 1)
    }
    onCardSwap?.({ squareIndex: result.square_index, newSquare: result.new_square })
  }, [roomId, rosterPlayers, onCardSwap, swapCount, oddsPool])
  const handleToggleMobileLeaderboard = useCallback(() => setMobileLeaderboard((v) => !v), [])
  const handleOpenMobileChat = useCallback(() => setMobileChat(true), [])
  const handleCloseMobileChat = useCallback(() => setMobileChat(false), [])

  const { username: profileUsername, dabsBalance, boardSkin } = useProfile()
  const username = profileUsername
    ?? (user?.is_anonymous ? `Guest_${user.id.slice(0, 8)}` : (user?.email ?? 'Guest'))

  const statusVariant = room?.status === 'live' ? 'success' : room?.status === 'finished' ? 'muted' : 'warning'
  const statusLabel = room?.status === 'live' ? 'Live' : room?.status === 'finished' ? 'Finished' : 'Lobby'

  const countdown = useCountdown(room?.starts_at ?? null)

  // ── Game-over Dabs summary ─────────────────────────────────────────────────
  const dabsSummary = useMemo(() => {
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

    const squareDabs = (card.squares_marked ?? 0) * 2
    const lineDabs   = (card.lines_completed ?? 0) * 10
    const participation = 3
    const total = squareDabs + lineDabs + posBonus + participation

    const ordinal = (n) => {
      if (n === 1) return '1st'; if (n === 2) return '2nd'; if (n === 3) return '3rd'
      return `${n}th`
    }

    return { myRank, posBonus, squareDabs, lineDabs, participation, total, ordinal }
  }, [room?.status, card, leaderboardCards, user?.id])

  const winningLines = bingoResult.winningLines ?? []

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-bg-primary">
      {/* ── Header ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-secondary px-4">
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

      {/* ── Game-over Dabs summary ── */}
      {dabsSummary && (
        <div
          className="shrink-0 border-b px-4 py-3 animate-in-from-top"
          style={{ background: 'rgba(255,107,53,0.06)', borderColor: 'rgba(255,107,53,0.18)' }}
        >
          <div className="mx-auto flex max-w-lg flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {/* Left: rank + total */}
            <div className="flex items-center gap-3">
              <span style={{ fontSize: 22 }}>
                {dabsSummary.myRank === 1 ? '🥇' : dabsSummary.myRank === 2 ? '🥈' : dabsSummary.myRank === 3 ? '🥉' : '🎯'}
              </span>
              <div>
                <p className="text-xs font-semibold" style={{ color: '#e0e0f0' }}>
                  {dabsSummary.myRank > 0 ? `Finished ${dabsSummary.ordinal(dabsSummary.myRank)}` : 'Game Over'}
                </p>
                <p className="text-[10px]" style={{ color: '#555577' }}>
                  Game finished — Dabs awarded
                </p>
              </div>
            </div>

            {/* Right: breakdown */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]" style={{ color: '#8888aa' }}>
              <span>{card.squares_marked} squares × 2 = <strong style={{ color: '#ff6b35' }}>{dabsSummary.squareDabs}</strong></span>
              <span style={{ color: '#2a2a44' }}>·</span>
              <span>{card.lines_completed} lines × 10 = <strong style={{ color: '#ff6b35' }}>{dabsSummary.lineDabs}</strong></span>
              {dabsSummary.posBonus > 0 && (
                <>
                  <span style={{ color: '#2a2a44' }}>·</span>
                  <span>Position +<strong style={{ color: '#ff6b35' }}>{dabsSummary.posBonus}</strong></span>
                </>
              )}
              <span style={{ color: '#2a2a44' }}>·</span>
              <span>Participation +<strong style={{ color: '#ff6b35' }}>3</strong></span>
              <span
                style={{ marginLeft: 4, borderRadius: 4, padding: '2px 8px', fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 800, background: 'rgba(255,107,53,0.12)', color: '#ff6b35', border: '1px solid rgba(255,107,53,0.25)' }}
              >
                ◈ +{dabsSummary.total} Dabs
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Main 3-column area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Bingo Board */}
        <div className={`flex shrink-0 flex-col items-center justify-center overflow-y-auto p-4 gap-3 transition-all duration-200 ${selectedSquare ? 'w-full lg:w-[45%]' : 'w-full lg:w-[65%]'}`}>
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
                isLobby={room?.status === 'lobby'}
                onSwapRequest={handleSwapRequest}
                swappingSquareIndex={swappingSquareIndex}
                swapCount={swapCount}
                oddsPool={oddsPool}
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
                        ? 'Hover any square to swap it — 10 ◈ (swap 1) · 50 ◈ (swap 2)'
                        : 'One swap left — 50 ◈ (1/2 used)'}
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
                <div style={{ width: '100%', maxWidth: 512, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#12121e', border: '1px solid #2a2a44', borderRadius: 4, padding: '8px 16px' }}>
                  <Link to="/store" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', textDecoration: 'none', letterSpacing: '0.04em' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b35' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#8888aa' }}
                  >
                    CUSTOMIZE YOUR LOOK IN THE DABS STORE →
                  </Link>
                  <button type="button" onClick={handleDismissStorePromo}
                    style={{ background: 'none', border: 'none', color: '#3a3a55', cursor: 'pointer', fontFamily: 'var(--db-font-mono)', fontSize: 12, padding: '0 0 0 12px', lineHeight: 1 }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = '#555577' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = '#3a3a55' }}
                  >✕</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577', textAlign: 'center', maxWidth: 300 }}>
                Failed to generate your bingo card. The game roster may not be available yet.
              </span>
              {onRetryCard && (
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
              realtimeStatEvents={statEvents}
              resetStatEvents={resetStatEvents}
              onClose={handleCloseStats}
            />
          )}
        </div>

        {/* RIGHT: Leaderboard + Chat (desktop) */}
        <div className="hidden w-[35%] shrink-0 flex-col border-l border-border-subtle lg:flex">
          <div className="flex-[45] overflow-y-auto p-3 scrollbar-thin">
            <Suspense fallback={<PanelFallback />}>
              <Leaderboard
                roomId={roomId}
                currentUserId={user?.id}
                realtimeCards={leaderboardCards}
                participantJoined={participantJoined}
              />
            </Suspense>
          </div>
          <div className="border-t border-border-subtle" />
          <div className="flex-[55] overflow-hidden p-3">
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
              />
            </Suspense>
          </div>
          <div className="overflow-hidden p-3" style={{ maxHeight: '16rem' }}>
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

      {/* ── Mobile: stacked panels ── */}
      <div className="border-t border-border-subtle md:hidden">
        {selectedSquare && mobileStats && (
          <div className="border-b border-border-subtle animate-slide-in-left">
            <PlayerStatsPanel
              playerId={selectedSquare.player_id}
              playerName={selectedSquare.player_name}
              playerSquares={playerSquares}
              gameId={room?.game_id}
              realtimeStatEvents={statEvents}
              resetStatEvents={resetStatEvents}
              onClose={handleCloseStatsMobile}
            />
          </div>
        )}

        <button
          type="button"
          onClick={handleToggleMobileLeaderboard}
          className="flex w-full items-center justify-between border-b border-border-subtle bg-bg-secondary px-4 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted"
        >
          Leaderboard
          <span className="text-text-muted">{mobileLeaderboard ? '▲' : '▼'}</span>
        </button>
        {mobileLeaderboard && (
          <div className="overflow-y-auto bg-bg-secondary p-3 scrollbar-thin" style={{ maxHeight: '14rem' }}>
            <Suspense fallback={<PanelFallback />}>
              <Leaderboard
                roomId={roomId}
                currentUserId={user?.id}
                realtimeCards={leaderboardCards}
                participantJoined={participantJoined}
              />
            </Suspense>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      <footer className="flex h-10 shrink-0 items-center justify-between border-t border-border-subtle bg-bg-secondary px-4">
        <div className="flex items-center gap-4 text-[11px] text-text-muted">
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

      {/* ── Mobile chat FAB + overlay ── */}
      <div className="md:hidden">
        {mobileChat && (
          <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(12,12,20,0.95)', backdropFilter: 'blur(6px)' }}>
            <div className="flex h-12 items-center justify-between border-b border-border-subtle px-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">Chat</span>
              <button
                type="button"
                onClick={handleCloseMobileChat}
                className="rounded p-1 text-text-muted hover:text-text-primary"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden p-3">
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
        )}

        {!mobileChat && (
          <button
            type="button"
            onClick={handleOpenMobileChat}
            className="fixed bottom-16 right-4 z-40 flex h-12 w-12 items-center justify-center transition"
            style={{ background: '#8b5cf6', borderRadius: '50%', boxShadow: '0 4px 16px rgba(139,92,246,0.3)', border: 'none', cursor: 'pointer' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#7c3aed' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#8b5cf6' }}
            aria-label="Open chat"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Game Over modal ── */}
      {room?.status === 'finished' && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Final leaderboard"
        >
          <div className="w-full max-w-md machine-glow" style={{ background: '#12121e', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 8, padding: 24 }}>
            <h2 className="font-display text-lg font-bold tracking-wide text-accent-gold">
              Game Over
            </h2>
            <p className="mt-1 text-xs text-text-muted">Final standings</p>
            <div className="mt-4">
              <Suspense fallback={<PanelFallback />}>
                <Leaderboard
                  roomId={roomId}
                  currentUserId={user?.id}
                  realtimeCards={leaderboardCards}
                  participantJoined={participantJoined}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default GameRoom
