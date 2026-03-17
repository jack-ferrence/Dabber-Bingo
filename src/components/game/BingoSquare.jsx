import { memo, useEffect, useRef, useState } from 'react'

const BingoSquare = memo(function BingoSquare({ square, index, isWinning, isLineFlash, onClick, swapMode = false }) {
  const isFree = index === 12
  const marked = square?.marked === true
  const displayText = square?.display_text ?? ''
  const prevMarkedRef = useRef(marked)
  const [justMarked, setJustMarked] = useState(false)

  useEffect(() => {
    if (marked && !prevMarkedRef.current) {
      setJustMarked(true)
      const t = setTimeout(() => setJustMarked(false), 500)
      prevMarkedRef.current = marked
      return () => clearTimeout(t)
    }
    prevMarkedRef.current = marked
  }, [marked])

  let playerLabel = ''
  let statLabel = displayText
  if (!isFree && displayText) {
    const match = displayText.match(/^(.+?)\s+(\d+\+?\s+\S+)$/)
    if (match) {
      playerLabel = match[1]
      statLabel = match[2]
    }
  }

  if (isFree) {
    return (
      <button
        type="button"
        className={`select-none sq-free-glow ${isWinning ? 'sq-winning' : ''} ${isLineFlash ? 'sq-line-flash' : ''}`}
        style={{
          aspectRatio: '1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#ff6b35',
          border: '1px solid #ff8855',
          borderRadius: 4,
          cursor: 'default',
        }}
      >
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 900, color: '#0c0c14' }}>★</span>
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', color: '#0c0c14' }}>FREE</span>
      </button>
    )
  }

  if (marked) {
    return (
      <button
        type="button"
        onClick={() => onClick?.(square, index)}
        className={`select-none sq-marked-glow ${justMarked ? 'sq-mark-in sq-shine' : ''} ${isWinning ? 'sq-winning' : ''} ${isLineFlash ? 'sq-line-flash' : ''}`}
        style={{
          aspectRatio: '1',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          background: '#2a1a10',
          border: '1px solid #ff6b35',
          borderRadius: 4,
          padding: 4,
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {playerLabel && (
          <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 700, color: 'rgba(255,107,53,0.8)' }}>
            {playerLabel}
          </span>
        )}
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 800, color: '#ff6b35', lineHeight: 1.2 }}>
          {statLabel}
        </span>
        <span style={{ position: 'absolute', right: 3, top: 2, fontSize: 8, color: '#ff6b35' }}>✓</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onClick?.(square, index)}
      className="select-none"
      style={{
        aspectRatio: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        background: '#1a1a2e',
        border: swapMode ? '1px dashed #ff6b35' : '1px solid #2a2a44',
        borderRadius: 4,
        padding: 4,
        cursor: swapMode ? 'crosshair' : 'pointer',
        transition: 'all 150ms ease',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = swapMode ? '#2a1a10' : '#22223a'; e.currentTarget.style.borderColor = '#ff6b35' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.borderColor = swapMode ? '#ff6b35' : '#2a2a44' }}
    >
      {playerLabel && (
        <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 600, color: '#8888aa' }}>
          {playerLabel}
        </span>
      )}
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 600, color: '#e0e0f0', lineHeight: 1.2 }}>
        {statLabel}
      </span>
    </button>
  )
})

export default BingoSquare
