import { lazy, Suspense, useState, useMemo, useCallback } from 'react'
import BingoBoard from './BingoBoard.jsx'
import PlayerStatsPanel from './PlayerStatsPanel.jsx'
import Badge from '../ui/Badge.jsx'
import { checkBingo } from '../../game/statProcessor.js'
import { useCountdown } from '../../hooks/useCountdown.js'

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
  gameStartedNotification,
  error,
  leaderboardCards,
  chatMessages,
  statEvents,
  participantJoined,
  initChatMessages,
  resetStatEvents,
}) {
  const [selectedSquare, setSelectedSquare] = useState(null)
  const [mobileChat, setMobileChat] = useState(false)
  const [mobileLeaderboard, setMobileLeaderboard] = useState(false)
  const [mobileStats, setMobileStats] = useState(false)

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
  const handleToggleMobileLeaderboard = useCallback(() => setMobileLeaderboard((v) => !v), [])
  const handleOpenMobileChat = useCallback(() => setMobileChat(true), [])
  const handleCloseMobileChat = useCallback(() => setMobileChat(false), [])

  const username = user?.is_anonymous
    ? `Guest_${user.id.slice(0, 8)}`
    : (user?.email ?? 'Guest')

  const statusVariant = room?.status === 'live' ? 'success' : room?.status === 'finished' ? 'muted' : 'warning'
  const statusLabel = room?.status === 'live' ? 'Live' : room?.status === 'finished' ? 'Finished' : 'Lobby'

  const countdown = useCountdown(room?.starts_at ?? null)

  const winningLines = bingoResult.winningLines ?? []

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-bg-primary">
      {/* ── Header ── */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle bg-bg-secondary px-4">
        <div className="flex items-center gap-3 min-w-0">
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
                  className="rounded-md bg-accent-green px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-accent-green/80"
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

      {/* ── Main 3-column area ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* LEFT: Bingo Board */}
        <div className={`flex shrink-0 items-center justify-center overflow-y-auto p-4 transition-all duration-200 ${selectedSquare ? 'w-full lg:w-[45%]' : 'w-full lg:w-[65%]'}`}>
          {loadingCard ? (
            <div className="text-sm text-text-secondary">Loading your card...</div>
          ) : card ? (
            <BingoBoard
              squares={card.squares}
              winningSquares={winningSquareIds}
              winningLines={winningLines}
              hasBingo={bingoResult.hasBingo}
              onSquareClick={handleSquareClick}
            />
          ) : (
            <div className="text-sm text-text-secondary">No card available.</div>
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
          <div className="fixed inset-0 z-50 flex flex-col bg-bg-primary/95 backdrop-blur-sm">
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
            className="fixed bottom-16 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-accent-purple shadow-lg shadow-accent-purple/30 transition hover:bg-accent-purple/80"
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
          <div className="w-full max-w-md rounded-2xl border-2 border-accent-gold/40 bg-bg-secondary p-6 shadow-2xl machine-glow">
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
