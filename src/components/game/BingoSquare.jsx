import { memo, useEffect, useRef, useState } from 'react'
import { hapticLight } from '../../lib/haptics.js'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, getSmartTeamColor } from '../../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (!abbr) return '#3a3a5c'
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#3a3a5c'
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? '#3a3a5c'
  return NBA_TEAM_COLORS[abbr] ?? '#3a3a5c'
}

function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(58,58,92,${alpha})`
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function parseDisplay(text) {
  if (!text) return { name: '', stat: '' }
  const m = text.match(/^(.+?)\s+([\d.]+\+?\s+\S+)$/)
  return m ? { name: m[1], stat: m[2] } : { name: text, stat: '' }
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
  daubStyle = 'classic',
  sport = 'nba',
  currentValue = 0,
  opponentAbbr = '',
  isHighlighted = false,
}) {
  const isFree = index === 12
  const marked = square?.marked === true
  const displayText = square?.display_text ?? ''
  const threshold = Number(square?.threshold) || 0
  const teamAbbr = square?.team_abbr ?? ''
  const teamColor = opponentAbbr
    ? getSmartTeamColor(teamAbbr, sport, opponentAbbr)
    : getTeamColor(teamAbbr, sport)
  const jerseyNum = square?.jersey_number || ''
  const { name: playerLabel, stat: statLabel } = parseDisplay(isFree ? '' : displayText)
  const statParts = statLabel.match(/^([\d.]+\+?)\s+(.+)$/)
  const statNum  = statParts ? statParts[1] : statLabel
  const statType = statParts ? statParts[2] : ''
  const progressPct = threshold > 0 ? Math.min(100, ((currentValue ?? 0) / threshold) * 100) : 0
  const showProgress = !isLobby && !isFree && threshold > 0

  // ── Mark animation ──
  const prevMarkedRef = useRef(marked)
  const [justMarked, setJustMarked] = useState(false)

  useEffect(() => {
    if (marked && !prevMarkedRef.current) {
      hapticLight()
      const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (!prefersReduced) {
        setJustMarked(true)
        const t = setTimeout(() => setJustMarked(false), 600)
        prevMarkedRef.current = marked
        return () => clearTimeout(t)
      }
    }
    prevMarkedRef.current = marked
  }, [marked])

  // ── Long-press for swap on mobile ──
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  const touchStart = useRef({ x: 0, y: 0 })

  function handleTouchStart(e) {
    if (!isLobby || swapsExhausted) return
    longPressFired.current = false
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      onSwapRequest?.(square, index)
    }, 500)
  }
  function cancelLongPress() { clearTimeout(longPressTimer.current) }
  function handleTouchMove(e) {
    const dx = e.touches[0].clientX - touchStart.current.x
    const dy = e.touches[0].clientY - touchStart.current.y
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress()
  }
  function handleTouchEnd(e) {
    cancelLongPress()
    if (longPressFired.current) { e.preventDefault(); longPressFired.current = false }
  }

  // ══════════════════════════════════════════════
  // FREE SQUARE
  // ══════════════════════════════════════════════
  if (isFree) {
    return (
      <button type="button" onClick={() => onClick?.(square)}
        aria-label="Free square"
        className={`sq-free-glow ${isWinning ? 'sq-winning-square' : ''} ${isLineFlash ? 'sq-line-flash' : ''}`}
        style={{
          width: '100%', aspectRatio: '1', borderRadius: 6,
          background: 'var(--db-primary)', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 12px rgba(255,107,53,0.3)',
        }}>
        <span style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 20, fontWeight: 400, color: 'var(--db-free-text)',
          letterSpacing: '0.08em',
        }}>FREE</span>
      </button>
    )
  }

  // ══════════════════════════════════════════════
  // SWAPPING STATE
  // ══════════════════════════════════════════════
  if (isSwapping) {
    return (
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 6, background: 'var(--db-bg-elevated)',
        border: '1px solid rgba(255,107,53,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: 'var(--db-primary)' }}>⟳</span>
      </div>
    )
  }

  // ══════════════════════════════════════════════
  // COLORS — high contrast
  // ══════════════════════════════════════════════
  const bg = marked
    ? 'rgba(255,107,53,0.10)'
    : hexToRgba(teamColor, 0.06)

  const borderClr = marked
    ? 'rgba(255,107,53,0.6)'
    : isWinning
      ? 'rgba(255,107,53,0.45)'
      : hexToRgba(teamColor, 0.18)

  const leftBorderClr = marked
    ? 'var(--db-primary)'
    : teamColor

  const shadow = marked
    ? '0 0 8px rgba(255,107,53,0.2)'
    : isWinning
      ? '0 0 10px rgba(255,107,53,0.15)'
      : 'none'

  // ══════════════════════════════════════════════
  // RENDER — Clean vertical stack, full width for text
  // ══════════════════════════════════════════════
  return (
    <button type="button"
      aria-label={`${playerLabel} ${statLabel}${marked ? ', marked' : ''}`}
      onClick={() => { if (longPressFired.current) return; onClick?.(square, index) }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={cancelLongPress}
      onContextMenu={(e) => { if (isLobby) e.preventDefault() }}
      className={`sq-cell ${marked ? 'sq-marked' : ''} ${isLineFlash ? 'sq-line-flash' : ''} ${justMarked ? 'sq-just-marked' : ''} ${isWinning ? 'sq-winning-square' : ''}`}
      style={{
        width: '100%', aspectRatio: '1', borderRadius: 6,
        display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'flex-start',
        overflow: 'hidden', position: 'relative',
        background: bg,
        border: `1.5px solid ${borderClr}`,
        borderLeft: `3px solid ${leftBorderClr}`,
        boxShadow: isHighlighted
          ? '0 0 12px rgba(255,107,53,0.5), inset 0 0 8px rgba(255,107,53,0.15)'
          : shadow,
        cursor: 'pointer',
        padding: '3px 4px 7px 5px',
        transition: 'border-color 150ms, box-shadow 150ms, background 150ms, transform 150ms',
        transform: justMarked ? 'scale(1.03)' : isHighlighted ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* Row 1: Player name + team tag */}
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        width: '100%', minWidth: 0, gap: 2,
      }}>
        <span className="sq-player" style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 800, lineHeight: 1.1,
          color: marked ? 'var(--db-primary)' : '#e8e8f4',
          textTransform: 'uppercase', whiteSpace: 'nowrap',
          overflow: 'hidden', textOverflow: 'ellipsis',
          minWidth: 0, flex: 1,
        }}>{playerLabel}</span>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700, lineHeight: 1, flexShrink: 0,
          color: marked ? 'rgba(255,107,53,0.6)' : hexToRgba(teamColor, 0.85),
          letterSpacing: '0.02em',
        }} className="sq-team">{teamAbbr}</span>
      </div>

      {/* Row 2: Stat threshold + type */}
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 3, marginTop: 2,
      }}>
        <span className="sq-stat" style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700, whiteSpace: 'nowrap',
          color: marked ? 'rgba(255,150,90,0.9)' : '#c0c0d8',
          lineHeight: 1.1,
        }}>{statNum}</span>
        {statType && (
          <span className="sq-stat-type" style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontWeight: 600, whiteSpace: 'nowrap',
            color: marked ? 'rgba(255,140,80,0.6)' : '#8888a8',
            lineHeight: 1,
          }}>{statType}</span>
        )}
      </div>

      {/* Jersey number — bottom-right corner, only if available */}
      {jerseyNum && (
        <span className="sq-jersey" style={{
          position: 'absolute', bottom: showProgress ? 6 : 4, right: 4,
          fontFamily: "'Bebas Neue',sans-serif",
          fontWeight: 400, lineHeight: 1,
          color: marked ? 'rgba(255,107,53,0.25)' : hexToRgba(teamColor, 0.25),
          pointerEvents: 'none',
        }}>{jerseyNum}</span>
      )}

      {/* ── Progress bar (bottom, full width) ── */}
      {showProgress && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
          background: 'var(--db-bg-elevated)',
        }}>
          <div style={{
            width: marked ? '100%' : `${progressPct}%`,
            height: '100%',
            background: marked
              ? 'linear-gradient(90deg, var(--db-primary-light), var(--db-primary))'
              : `linear-gradient(90deg, ${hexToRgba(teamColor, 0.5)}, ${teamColor})`,
            transition: 'width 0.5s ease-out',
          }} />
        </div>
      )}

      {/* Team-color bar when no progress */}
      {!showProgress && !marked && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: teamColor, opacity: 0.3,
        }} />
      )}

      {/* Marked: orange bottom bar */}
      {!showProgress && marked && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'var(--db-primary)', opacity: 0.7,
        }} />
      )}

      {/* Injury swap badge */}
      {square?.replaced_injury && (
        <span style={{
          position: 'absolute', top: 1, right: 3, zIndex: 2,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: 'var(--db-primary)', opacity: 0.5,
        }}>♻</span>
      )}
    </button>
  )
})

export default BingoSquare
