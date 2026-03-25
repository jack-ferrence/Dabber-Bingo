import { useEffect, useRef, useState } from 'react'
import BingoSquare from './BingoSquare.jsx'

const CONFETTI_COLORS = ['#FFD700', '#00D46E', '#8B5CF6', '#FF4757', '#00FF88', '#FF6B6B']

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
    <div className="relative w-full max-w-lg">
      {/* Board frame */}
      <div
        className={`machine-glow ${skinClass}`}
        style={{
          background: '#0c0c14', border: '1px solid #2a2a44', borderRadius: 8, padding: 12,
        }}
      >
        {/* 5×5 Grid */}
        <div className="grid grid-cols-5 gap-1.5 bingo-grid">
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
            />
          ))}
        </div>

        {/* Footer divider */}
        <div style={{ marginTop: 8, height: 1, background: '#1a1a2e' }} />
      </div>

      {/* Full-board BINGO overlay */}
      {hasBingo && (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center"
          style={{ borderRadius: 8, background: 'rgba(12,12,20,0.92)', backdropFilter: 'blur(4px)' }}
          role="alert"
          aria-live="polite"
        >
          <div
            style={{
              fontFamily: 'var(--db-font-mono)',
              fontSize: 36,
              fontWeight: 900,
              letterSpacing: '0.1em',
              color: '#ff6b35',
              animation: 'db-bingo 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
          >
            BINGO!
          </div>
          <p style={{ marginTop: 8, fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>
            {winningLines.length} line{winningLines.length === 1 ? '' : 's'} completed
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
            style={{ background: '#12121e', border: '1px solid rgba(255,107,53,0.5)', borderRadius: 6, padding: '8px 20px' }}
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
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 800, color: '#ff6b35', letterSpacing: '0.06em' }}>
              BINGO!
            </p>
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#8888aa' }}>
              Line {toast.lineNum} completed!
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

export default BingoBoard
