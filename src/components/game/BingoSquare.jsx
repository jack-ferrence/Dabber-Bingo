import { memo, useEffect, useRef, useState } from 'react'

const BingoSquare = memo(function BingoSquare({
  square,
  index,
  isWinning,
  isLineFlash,
  onClick,
  isLobby = false,
  onSwapRequest,
  isSwapping = false,
  swapsExhausted = false,
  nextSwapCost = 10,
}) {
  const isFree = index === 12
  const marked = square?.marked === true
  const displayText = square?.display_text ?? ''
  const prevMarkedRef = useRef(marked)
  const [justMarked, setJustMarked] = useState(false)
  const [hovered, setHovered] = useState(false)

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

  const TIER_COLORS = { easy: '#22c55e', medium: '#3b82f6', hard: '#f59e0b', longshot: '#ef4444' }
  const tierColor = square?.tier ? TIER_COLORS[square.tier] : null
  const tierPct = square?.implied_prob != null ? Math.round(square.implied_prob * 100) : null

  const odds = square?.american_odds
  const oddsLabel = odds != null ? `(${odds > 0 ? '+' : ''}${odds})` : null

  // ── FREE square ──────────────────────────────────────────────────────────────
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

  // ── Swap loading state ───────────────────────────────────────────────────────
  if (isSwapping) {
    return (
      <div
        style={{
          aspectRatio: '1',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#1a1a2e',
          border: '1px solid #ff6b35',
          borderRadius: 4,
          opacity: 0.7,
        }}
      >
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, color: '#ff6b35', animation: 'spin 1s linear infinite' }}>⟳</span>
      </div>
    )
  }

  // ── Marked square ────────────────────────────────────────────────────────────
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
        {oddsLabel && (
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 8, color: 'rgba(255,107,53,0.6)', lineHeight: 1 }}>
            {oddsLabel}
          </span>
        )}
        <span style={{ position: 'absolute', right: 3, top: 2, fontSize: 8, color: '#ff6b35' }}>✓</span>
        {tierColor && (
          <span
            title={tierPct != null ? `${square.tier} — ${tierPct}%` : square.tier}
            style={{ position: 'absolute', left: 3, top: 3, width: 5, height: 5, borderRadius: '50%', background: tierColor, opacity: 0.6, flexShrink: 0 }}
          />
        )}
      </button>
    )
  }

  // ── Normal (unmarked) square ─────────────────────────────────────────────────
  const showSwapBtn = isLobby && hovered && !swapsExhausted

  return (
    <button
      type="button"
      onClick={() => onClick?.(square, index)}
      onMouseEnter={(e) => {
        setHovered(true)
        e.currentTarget.style.background = '#22223a'
        e.currentTarget.style.borderColor = '#ff6b35'
      }}
      onMouseLeave={(e) => {
        setHovered(false)
        e.currentTarget.style.background = '#1a1a2e'
        e.currentTarget.style.borderColor = '#2a2a44'
      }}
      className="select-none"
      style={{
        aspectRatio: '1',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        background: '#1a1a2e',
        border: '1px solid #2a2a44',
        borderRadius: 4,
        padding: 4,
        cursor: 'pointer',
        transition: 'all 150ms ease',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {playerLabel && (
        <span style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center', fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 600, color: '#8888aa' }}>
          {playerLabel}
        </span>
      )}
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 600, color: '#e0e0f0', lineHeight: 1.2 }}>
        {statLabel}
      </span>
      {oddsLabel && (
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 8, color: '#555577', lineHeight: 1 }}>
          {oddsLabel}
        </span>
      )}

      {/* Tier difficulty dot — shown on odds-based cards */}
      {tierColor && (
        <span
          title={tierPct != null ? `${square.tier} — ${tierPct}%` : square.tier}
          style={{ position: 'absolute', left: 3, top: 3, width: 5, height: 5, borderRadius: '50%', background: tierColor, opacity: 0.6, flexShrink: 0 }}
        />
      )}

      {/* Swap button — lobby only, shown on hover */}
      {showSwapBtn && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSwapRequest?.(square, index)
          }}
          title={`Swap this square (${nextSwapCost} Dabs)`}
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: 'rgba(42,42,68,0.9)',
            color: '#8888aa',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--db-font-mono)',
            fontSize: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            padding: 0,
            zIndex: 2,
            transition: 'background 100ms ease, color 100ms ease',
          }}
          onMouseEnter={(e) => { e.stopPropagation(); e.currentTarget.style.background = '#ff6b35'; e.currentTarget.style.color = '#0c0c14' }}
          onMouseLeave={(e) => { e.stopPropagation(); e.currentTarget.style.background = 'rgba(42,42,68,0.9)'; e.currentTarget.style.color = '#8888aa' }}
        >
          ↻
        </button>
      )}
    </button>
  )
})

export default BingoSquare
