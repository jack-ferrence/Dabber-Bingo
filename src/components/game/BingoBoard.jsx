import { useCallback, useEffect, useRef, useState } from 'react'
import BingoSquare from './BingoSquare.jsx'
import BingoLineMiniMap from './BingoLineMiniMap.jsx'

const CONFETTI_COLORS = ['#FFD700', '#00D46E', '#8B5CF6', '#FF4757', '#00FF88', '#FF6B6B']
const HEADER_LETTERS = ['B', 'I', 'N', 'G', 'O']

function BingoBoard({
  squares = [],
  winningSquares = [],
  winningLines = [],
  hasBingo = false,
  onSquareClick,
  boardSkin = 'default',
  daubStyle = 'classic',
  isLobby = false,
  onSwapRequest,
  swappingSquareIndex = null,
  swapCount = 0,
  oddsPool = [],
  sport = 'nba',
  roomStatus,
  bingoDismissed = false,
  onBingoDismissed,
  statValueMap = null,
  roomName = '',
}) {
  const flat = Array.isArray(squares[0]) ? squares.flat() : squares
  const winSet = new Set(winningSquares)

  // Parse both teams from room name for smart color differentiation
  const _teams = roomName.split(' vs ').map(t => t.trim())
  const awayTeam = _teams[0] || ''
  const homeTeam = _teams[1] || ''

  const prevLineCountRef = useRef(winningLines.length)
  const [flashIndices, setFlashIndices] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [highlightedLine, setHighlightedLine] = useState(null)

  const handleHighlightLine = useCallback((lineIndices) => {
    setHighlightedLine(new Set(lineIndices))
    setTimeout(() => setHighlightedLine(null), 1500)
  }, [])

  useEffect(() => {
    const prevCount = prevLineCountRef.current
    const newCount = winningLines.length
    prevLineCountRef.current = newCount

    if (newCount > prevCount && newCount > 0) {
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const newLines = winningLines.slice(prevCount)
      const indices = new Set()
      for (const line of newLines) {
        for (const idx of line) indices.add(idx)
      }

      if (!prefersReduced) {
        setFlashIndices(indices)
        setTimeout(() => setFlashIndices(new Set()), 500)
      }

      const lineNum = newCount
      setToast({ id: Date.now(), lineNum, exiting: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [winningLines.length])

  useEffect(() => {
    if (!toast || toast.exiting) return
    const dismiss = setTimeout(() => {
      setToast((t) => (t ? { ...t, exiting: true } : null))
    }, 2500)
    return () => clearTimeout(dismiss)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id])

  useEffect(() => {
    if (!toast?.exiting) return
    const remove = setTimeout(() => setToast(null), 250)
    return () => clearTimeout(remove)
  }, [toast?.exiting])

  const skinClass = boardSkin && boardSkin !== 'default' ? `board-skin-${boardSkin}` : ''

  return (
    <div className="bingo-board-wrapper relative w-full" style={{ maxWidth: 'min(440px, 100%)', margin: '0 auto' }}>
      {/* Board frame */}
      <div
        className={`machine-glow ${skinClass}`}
        style={{
          background: 'var(--db-bg-surface)',
          border: '1px solid var(--db-border-default)',
          borderRadius: 12,
          padding: 10,
          boxShadow: 'var(--db-shadow-md)',
        }}
      >
        {/* B·I·N·G·O column headers */}
        <div className="grid grid-cols-5 mb-2" style={{ gap: 5 }}>
          {HEADER_LETTERS.map((letter, i) => (
            <div
              key={letter}
              className="bingo-header-letter"
              style={{
                textAlign: 'center',
                fontFamily: 'var(--db-font-display)',
                fontSize: 'var(--db-text-lg)',
                letterSpacing: 'var(--db-tracking-widest)',
                color: 'rgba(255,107,53,0.55)',
                lineHeight: 'var(--db-leading-none)',
                paddingBottom: 3,
                animation: 'sq-deal-in 250ms cubic-bezier(0.25, 1, 0.5, 1) both',
                animationDelay: `${i * 40}ms`,
              }}
            >
              {letter}
            </div>
          ))}
        </div>

        {/* 5×5 Grid */}
        <div className="grid grid-cols-5 bingo-grid" style={{ gap: 5, contain: 'layout style' }}>
          {flat.slice(0, 25).map((square, index) => (
            <BingoSquare
              key={square?.id ?? index}
              square={square}
              index={index}
              dealDelay={index * 30}
              isWinning={winSet.has(square?.id)}
              isLineFlash={flashIndices.has(index)}
              onClick={onSquareClick}
              isLobby={isLobby && index !== 12 && oddsPool.length > 0}
              onSwapRequest={onSwapRequest}
              isSwapping={swappingSquareIndex === index}
              swapsExhausted={swapCount >= 2}
              nextSwapCost={swapCount === 0 ? 10 : 50}
              daubStyle={daubStyle}
              sport={sport}
              opponentAbbr={square?.team_abbr === homeTeam ? awayTeam : homeTeam}
              isHighlighted={highlightedLine?.has(index) ?? false}
              currentValue={
                square?.player_id && square?.stat_type && statValueMap
                  ? (statValueMap[`${square.player_id}:${square.stat_type}`] ?? 0)
                  : 0
              }
            />
          ))}
        </div>

        {/* Bingo line mini-maps */}
        <BingoLineMiniMap
          winningLines={winningLines}
          onHighlightLine={handleHighlightLine}
        />

        {/* Footer rule */}
        <div style={{ marginTop: 8, height: 1, background: 'var(--db-border-subtle)' }} />
      </div>


      {/* Full-board BINGO overlay */}
      {hasBingo && !bingoDismissed && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          style={{ borderRadius: 12, background: 'var(--db-bg-overlay)', backdropFilter: 'blur(6px)', cursor: 'pointer' }}
          onClick={() => onBingoDismissed?.()}
          role="alert"
          aria-live="polite"
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: 'var(--db-font-display)',
                fontSize: '3.75rem',
                fontWeight: 900,
                letterSpacing: 'var(--db-tracking-normal)',
                color: 'var(--db-primary)',
                lineHeight: 0.95,
                animation: 'db-bingo 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                textShadow: '0 0 40px rgba(255,107,53,0.5)',
              }}
            >
              BINGO
            </div>
            <div style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 'var(--db-text-lg)',
              fontWeight: 'var(--db-weight-bold)',
              letterSpacing: 'var(--db-tracking-widest)',
              color: 'var(--db-text-ghost)',
              marginTop: 4,
            }}>
              {winningLines.length} LINE{winningLines.length === 1 ? '' : 'S'}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onBingoDismissed?.() }}
            style={{
              marginTop: 28,
              fontFamily: 'var(--db-font-display)',
              fontSize: 'var(--db-text-lg)',
              fontWeight: 'var(--db-weight-bold)',
              letterSpacing: 'var(--db-tracking-wide)',
              padding: '11px 32px',
              borderRadius: 6,
              background: 'var(--db-gradient-primary)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(255,107,53,0.4)',
            }}
          >
            {roomStatus === 'finished' ? 'VIEW CARD' : 'KEEP PLAYING'}
          </button>
          <p style={{ marginTop: 12, fontFamily: 'var(--db-font-ui)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)', letterSpacing: 'var(--db-tracking-normal)' }}>
            tap anywhere to dismiss
          </p>
        </div>
      )}

      {/* Per-line bingo toast */}
      {toast && (
        <div
          className={`absolute left-1/2 top-4 z-20 -translate-x-1/2 ${toast.exiting ? 'bingo-toast-exit' : 'bingo-toast-enter'}`}
        >
          <div
            className="relative overflow-hidden"
            style={{
              background: 'var(--db-bg-elevated)',
              border: '1px solid rgba(255,107,53,0.4)',
              borderRadius: 8,
              padding: '8px 22px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,107,53,0.1)',
            }}
          >
            <div className="bingo-toast-confetti" aria-hidden="true">
              {CONFETTI_COLORS.map((color, i) => (
                <span
                  key={i}
                  style={{
                    background: color,
                    left: `${15 + i * 14}%`,
                    top: '-2px',
                    animationDelay: `${i * 60}ms`,
                  }}
                />
              ))}
            </div>
            <p style={{ fontFamily: 'var(--db-font-display)', fontSize: '1.125rem', letterSpacing: '0.1em', color: 'var(--db-primary)', lineHeight: 'var(--db-leading-none)' }}>
              BINGO!
            </p>
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 'var(--db-text-xs)', color: 'var(--db-text-muted)', marginTop: 2, fontWeight: 'var(--db-weight-medium)' }}>
              Line {toast.lineNum} completed
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default BingoBoard
