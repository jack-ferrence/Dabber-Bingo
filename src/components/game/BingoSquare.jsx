import { memo, useEffect, useRef, useState } from 'react'
import DaubOverlay from './DaubOverlay.jsx'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS } from '../../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (!abbr) return null
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? null
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? null
  return NBA_TEAM_COLORS[abbr] ?? null
}

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
  daubStyle = 'classic',
  sport = 'nba',
  currentValue = 0,
}) {
  const isFree = index === 12
  const marked = square?.marked === true
  const displayText = square?.display_text ?? ''
  const prevMarkedRef = useRef(marked)
  const [justMarked, setJustMarked] = useState(false)
  const [hovered, setHovered] = useState(false)

  // Long-press state for mobile swap
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const touchStartPos = useRef({ x: 0, y: 0 })

  function handleTouchStart(e) {
    if (!isLobby || swapsExhausted) return
    longPressFired.current = false
    touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      onSwapRequest?.(square, index)
    }, 500)
  }

  function cancelLongPress() {
    clearTimeout(longPressTimer.current)
  }

  function handleTouchMove(e) {
    const dx = e.touches[0].clientX - touchStartPos.current.x
    const dy = e.touches[0].clientY - touchStartPos.current.y
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress()
  }

  function handleTouchEnd(e) {
    cancelLongPress()
    if (longPressFired.current) {
      e.preventDefault()
      longPressFired.current = false
    }
  }

  useEffect(() => {
    if (marked && !prevMarkedRef.current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setJustMarked(true)
      const t = setTimeout(() => setJustMarked(false), 500)
      prevMarkedRef.current = marked
      return () => clearTimeout(t)
    }
    prevMarkedRef.current = marked
  }, [marked])

  // Parse display_text into player name + stat line
  let playerLabel = ''
  let statLabel = displayText
  if (!isFree && displayText) {
    const match = displayText.match(/^(.+?)\s+([\d.]+\+?\s+\S+)$/)
    if (match) {
      playerLabel = match[1]
      statLabel = match[2]
    }
  }

  const teamAbbr = square?.team_abbr ?? ''
  const teamColor = getTeamColor(teamAbbr, sport)

  // ── FREE square ──────────────────────────────────────────────────────────────
  if (isFree) {
    return (
      <button
        type="button"
        className={`select-none sq-free-glow ${isWinning ? 'sq-winning' : ''} ${isLineFlash ? 'sq-line-flash' : ''}`}
        style={{
          aspectRatio: '1 / 0.9',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 1,
          background: 'linear-gradient(160deg, #ff7a45 0%, #e05520 100%)',
          border: '1px solid rgba(255,142,85,0.5)',
          borderRadius: 6,
          cursor: 'default',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.15), 0 2px 8px rgba(255,107,53,0.3)',
        }}
      >
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 900, color: '#fff', lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>★</span>
        <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.9)', lineHeight: 1 }}>FREE</span>
      </button>
    )
  }

  // ── Swap loading state ───────────────────────────────────────────────────────
  if (isSwapping) {
    return (
      <div
        style={{
          aspectRatio: '1 / 0.9',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(160deg, #1e1e30 0%, #161624 100%)',
          border: '1px solid rgba(255,107,53,0.4)',
          borderRadius: 6,
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
          aspectRatio: '1 / 0.9',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          gap: 3,
          background: 'rgba(255,107,53,0.10)',
          border: '1px solid rgba(255,107,53,0.3)',
          borderLeft: '3px solid #ff6b35',
          borderRadius: 6,
          padding: '5px 5px 8px 7px',
          cursor: 'pointer',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >
        {playerLabel && (
          <span className="sq-player" style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 800, color: '#ff8855', letterSpacing: '0.02em', lineHeight: 1.1 }}>
            {playerLabel}
          </span>
        )}
        <span className="sq-stat" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 600, color: 'rgba(255,140,80,0.65)', lineHeight: 1.15, textAlign: 'left' }}>
          {statLabel}
        </span>
        {!isFree && square?.threshold > 0 && (
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.04)', borderRadius: '0 0 5px 5px', overflow: 'hidden' }}>
            <div style={{ width: '100%', height: '100%', background: '#ff6b35', borderRadius: '0 0 5px 5px', transition: 'width 0.6s ease-out' }} />
          </div>
        )}
        {daubStyle === 'classic' && (
          <span style={{ position: 'absolute', right: 3, top: 2, fontFamily: 'var(--db-font-mono)', fontSize: 7, color: 'rgba(255,107,53,0.6)', fontWeight: 800 }}>✓</span>
        )}
        <DaubOverlay style={daubStyle} animated={justMarked} />
      </button>
    )
  }

  // ── Normal (unmarked) square ─────────────────────────────────────────────────
  const showSwapBtn = isLobby && hovered && !swapsExhausted

  return (
    <button
      type="button"
      onClick={() => { if (longPressFired.current) { longPressFired.current = false; return } onClick?.(square, index) }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={cancelLongPress}
      onContextMenu={(e) => { if (isLobby) e.preventDefault() }}
      className="select-none"
      style={{
        aspectRatio: '1 / 0.9',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'center',
        gap: 3,
        background: hovered
          ? 'linear-gradient(160deg, #232338 0%, #1c1c2e 100%)'
          : 'linear-gradient(160deg, #1c1c2c 0%, #141420 100%)',
        border: `1px solid ${hovered ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)'}`,
        borderLeft: `3px solid ${teamColor ?? 'rgba(255,255,255,0.08)'}`,
        borderRadius: 6,
        padding: '5px 5px 8px 7px',
        cursor: 'pointer',
        transition: 'background 120ms ease, border-color 120ms ease, transform 80ms ease',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
        transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
      }}
    >
      {playerLabel && (
        <span className="sq-player" style={{ width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'left', fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 800, color: '#e8e8f4', letterSpacing: '0.02em', lineHeight: 1.1 }}>
          {playerLabel}
        </span>
      )}
      <span className="sq-stat" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 600, color: '#ff6b35', lineHeight: 1.15, textAlign: 'left', letterSpacing: '0.02em' }}>
        {statLabel}
      </span>
      {currentValue > 0 && square?.threshold > 0 && (
        <span style={{ position: 'absolute', bottom: 8, right: 5, fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'rgba(255,255,255,0.35)', lineHeight: 1 }}>{currentValue}/{square.threshold}</span>
      )}
      {!isFree && square?.threshold > 0 && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 5, background: 'rgba(255,255,255,0.06)', borderRadius: '0 0 5px 5px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, ((currentValue ?? 0) / square.threshold) * 100)}%`,
            height: '100%',
            background: `linear-gradient(90deg, ${teamColor ? teamColor + '55' : 'rgba(255,107,53,0.4)'}, #ff6b35)`,
            borderRadius: '0 0 5px 5px',
            transition: 'width 0.6s ease-out',
          }} />
        </div>
      )}

      {/* Injury replacement indicator */}
      {square?.replaced_injury && (
        <span
          title="Replaced — player ruled out"
          style={{ position: 'absolute', top: 2, left: 4, fontFamily: 'var(--db-font-mono)', fontSize: 7, color: '#ff6b35', opacity: 0.6 }}
        >
          ♻
        </span>
      )}

      {/* Mobile swap hint — lobby only */}
      {isLobby && !swapsExhausted && !showSwapBtn && (
        <span className="sq-swap-hint">↻</span>
      )}

      {/* Swap button — lobby only, shown on hover */}
      {showSwapBtn && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onSwapRequest?.(square, index)
          }}
          title="Swap this square"
          style={{
            position: 'absolute',
            top: 2,
            right: 2,
            width: 16,
            height: 16,
            borderRadius: '50%',
            background: 'rgba(30,30,50,0.95)',
            border: '1px solid rgba(255,255,255,0.12)',
            color: '#6666aa',
            cursor: 'pointer',
            fontFamily: 'var(--db-font-mono)',
            fontSize: 9,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
            padding: 0,
            zIndex: 2,
            transition: 'background 100ms ease, color 100ms ease, border-color 100ms ease',
          }}
          onMouseEnter={(e) => { e.stopPropagation(); e.currentTarget.style.background = '#ff6b35'; e.currentTarget.style.color = '#0c0c14'; e.currentTarget.style.borderColor = '#ff6b35' }}
          onMouseLeave={(e) => { e.stopPropagation(); e.currentTarget.style.background = 'rgba(30,30,50,0.95)'; e.currentTarget.style.color = '#6666aa'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)' }}
        >
          ↻
        </button>
      )}
    </button>
  )
})

export default BingoSquare
