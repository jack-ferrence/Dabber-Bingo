import { useEffect, useRef, useState } from 'react'
import BingoSquare from './BingoSquare.jsx'

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
}) {
  const flat = Array.isArray(squares[0]) ? squares.flat() : squares
  const winSet = new Set(winningSquares)

  const prevLineCountRef = useRef(winningLines.length)
  const [flashIndices, setFlashIndices] = useState(new Set())
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const prevCount = prevLineCountRef.current
    const newCount = winningLines.length
    prevLineCountRef.current = newCount

    if (newCount > prevCount && newCount > 0) {
      const newLines = winningLines.slice(prevCount)
      const indices = new Set()
      for (const line of newLines) {
        for (const idx of line) indices.add(idx)
      }

      setFlashIndices(indices)
      setTimeout(() => setFlashIndices(new Set()), 500)

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
    <div className="relative w-full" style={{ maxWidth: 'min(440px, 100%)', margin: '0 auto' }}>
      {/* Board frame */}
      <div
        className={`machine-glow ${skinClass}`}
        style={{
          background: 'linear-gradient(180deg, #0f0f1c 0%, #0a0a14 100%)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 12,
          padding: 10,
          boxShadow: '0 4px 32px rgba(0,0,0,0.5), 0 1px 0 rgba(255,255,255,0.05) inset, 0 -1px 0 rgba(0,0,0,0.3) inset',
        }}
      >
        {/* B·I·N·G·O column headers */}
        <div className="grid grid-cols-5 mb-2" style={{ gap: 5 }}>
          {HEADER_LETTERS.map((letter) => (
            <div
              key={letter}
              style={{
                textAlign: 'center',
                fontFamily: 'var(--db-font-display)',
                fontSize: 15,
                letterSpacing: '0.12em',
                color: 'rgba(255,107,53,0.55)',
                lineHeight: 1,
                paddingBottom: 3,
              }}
            >
              {letter}
            </div>
          ))}
        </div>

        {/* 5×5 Grid */}
        <div className="grid grid-cols-5 bingo-grid" style={{ gap: 5 }}>
          {flat.slice(0, 25).map((square, index) => (
            <BingoSquare
              key={square?.id ?? index}
              square={square}
              index={index}
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
              currentValue={
                square?.player_id && square?.stat_type && statValueMap
                  ? (statValueMap[`${square.player_id}:${square.stat_type}`] ?? 0)
                  : 0
              }
            />
          ))}
        </div>

        {/* Footer rule */}
        <div style={{ marginTop: 8, height: 1, background: 'rgba(255,255,255,0.04)' }} />
      </div>


      {/* Full-board BINGO overlay */}
      {hasBingo && !bingoDismissed && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          style={{ borderRadius: 12, background: 'rgba(8,8,18,0.94)', backdropFilter: 'blur(6px)', cursor: 'pointer' }}
          onClick={() => onBingoDismissed?.()}
          role="alert"
          aria-live="polite"
        >
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: 'var(--db-font-display)',
                fontSize: 60,
                fontWeight: 900,
                letterSpacing: '0.04em',
                color: '#ff6b35',
                lineHeight: 0.95,
                animation: 'db-bingo 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                textShadow: '0 0 40px rgba(255,107,53,0.5)',
              }}
            >
              BINGO
            </div>
            <div style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.35)',
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
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '0.06em',
              padding: '11px 32px',
              borderRadius: 6,
              background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
              color: '#fff',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(255,107,53,0.4)',
            }}
          >
            {roomStatus === 'finished' ? 'VIEW CARD' : 'KEEP PLAYING'}
          </button>
          <p style={{ marginTop: 12, fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.02em' }}>
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
              background: 'linear-gradient(160deg, #141420 0%, #0e0e1a 100%)',
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
            <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 18, letterSpacing: '0.1em', color: '#ff6b35', lineHeight: 1 }}>
              BINGO!
            </p>
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, color: '#6666aa', marginTop: 2, fontWeight: 500 }}>
              Line {toast.lineNum} completed
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default BingoBoard
