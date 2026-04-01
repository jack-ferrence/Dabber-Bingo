import { memo, useEffect, useRef, useState } from 'react'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS } from '../../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (!abbr) return '#ff6b35'
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#ff6b35'
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? '#ff6b35'
  return NBA_TEAM_COLORS[abbr] ?? '#ff6b35'
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

  // Long-press for mobile swap
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
  function cancelLongPress() { clearTimeout(longPressTimer.current) }
  function handleTouchMove(e) {
    const dx = e.touches[0].clientX - touchStartPos.current.x
    const dy = e.touches[0].clientY - touchStartPos.current.y
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) cancelLongPress()
  }
  function handleTouchEnd(e) {
    cancelLongPress()
    if (longPressFired.current) { e.preventDefault(); longPressFired.current = false }
  }

  useEffect(() => {
    if (marked && !prevMarkedRef.current) {
      setJustMarked(true)
      const t = setTimeout(() => setJustMarked(false), 600)
      prevMarkedRef.current = marked
      return () => clearTimeout(t)
    }
    prevMarkedRef.current = marked
  }, [marked])

  // Parse player name + stat line
  let playerLabel = ''
  let statLabel = displayText
  if (!isFree && displayText) {
    const match = displayText.match(/^(.+?)\s+([\d.]+\+?\s+\S+)$/)
    if (match) { playerLabel = match[1]; statLabel = match[2] }
  }

  // Threshold + progress
  let threshold = Number(square?.threshold) || 0
  if (threshold === 0 && statLabel) {
    const numMatch = statLabel.match(/([\d.]+)\+?\s/)
    if (numMatch) threshold = Number(numMatch[1]) || 0
  }
  const progressPct = threshold > 0 ? Math.min(100, ((currentValue ?? 0) / threshold) * 100) : 0
  const showProgress = !isLobby && !isFree && threshold > 0

  // Team color for the progress bar
  const teamAbbr = square?.team_abbr ?? ''
  const teamColor = getTeamColor(teamAbbr, sport)

  // Swap button on hover (desktop)
  const showSwapBtn = isLobby && !swapsExhausted && hovered && !isFree

  // ── FREE SQUARE ──
  if (isFree) {
    return (
      <button
        type="button"
        onClick={() => onClick?.(square)}
        className={isLineFlash ? 'sq-line-flash' : ''}
        style={{
          position: 'relative', width: '100%', aspectRatio: '1',
          borderRadius: 8, overflow: 'hidden',
          background: '#ff6b35',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(255,107,53,0.2)',
        }}
      >
        <span style={{
          fontFamily: 'var(--db-font-display)', fontSize: 20, color: '#fff',
          letterSpacing: '0.1em', lineHeight: 1,
        }}>FREE</span>
      </button>
    )
  }

  // ── SWAPPING STATE ──
  if (isSwapping) {
    return (
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 8,
        background: '#1a1a2e', border: '1px solid rgba(255,107,53,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, color: '#ff6b35' }}>⟳</span>
      </div>
    )
  }

  // ── REGULAR SQUARE ──
  return (
    <button
      type="button"
      onClick={() => { if (longPressFired.current) return; onClick?.(square, index) }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={cancelLongPress}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={(e) => { if (isLobby) e.preventDefault() }}
      className={`${isLineFlash ? 'sq-line-flash' : ''} ${justMarked ? 'sq-just-marked' : ''}`}
      style={{
        position: 'relative', width: '100%', aspectRatio: '1',
        borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'center',
        padding: '6px 7px 10px',
        textAlign: 'left',
        background: marked ? 'rgba(255,107,53,0.06)' : '#1a1a2e',
        border: marked
          ? '1.5px solid rgba(255,107,53,0.5)'
          : isWinning
            ? '1.5px solid rgba(255,107,53,0.3)'
            : '1px solid rgba(255,255,255,0.05)',
        boxShadow: marked ? '0 0 12px rgba(255,107,53,0.1)' : 'none',
        transition: 'background 150ms ease, border-color 150ms ease, box-shadow 150ms ease, transform 80ms ease',
        transform: justMarked ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      {/* Player name */}
      <span className="sq-player" style={{
        fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 800,
        color: marked ? '#ff6b35' : '#e8e8f4',
        lineHeight: 1.15, letterSpacing: '0.01em',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: '100%', display: 'block',
      }}>{playerLabel}</span>

      {/* Stat line */}
      <span className="sq-stat" style={{
        fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 600,
        color: marked ? 'rgba(255,107,53,0.6)' : 'rgba(255,107,53,0.8)',
        lineHeight: 1.1, marginTop: 2,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        maxWidth: '100%', display: 'block',
      }}>{statLabel}</span>

      {/* ── PROGRESS BAR — team color, fills left to right ── */}
      {showProgress && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 4,
          background: 'rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: marked ? '100%' : `${progressPct}%`,
            height: '100%',
            background: marked ? '#ff6b35' : teamColor,
            transition: 'width 0.5s ease-out',
          }} />
        </div>
      )}

      {/* Lobby: thin team color accent at bottom */}
      {isLobby && !showProgress && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          height: 3, background: teamColor, opacity: 0.4,
        }} />
      )}

      {/* Swap hint (mobile) */}
      {isLobby && !swapsExhausted && !showSwapBtn && (
        <span style={{
          position: 'absolute', top: 3, right: 4,
          fontFamily: 'var(--db-font-mono)', fontSize: 9,
          color: 'rgba(255,255,255,0.2)', pointerEvents: 'none',
        }}>↻</span>
      )}

      {/* Swap button (desktop hover) */}
      {showSwapBtn && (
        <button type="button"
          onClick={(e) => { e.stopPropagation(); onSwapRequest?.(square, index) }}
          style={{
            position: 'absolute', top: 3, right: 3,
            width: 18, height: 18, borderRadius: '50%',
            background: 'rgba(20,20,35,0.95)', border: '1px solid rgba(255,255,255,0.12)',
            color: '#ff6b35', cursor: 'pointer',
            fontFamily: 'var(--db-font-mono)', fontSize: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            lineHeight: 1, padding: 0, zIndex: 2,
          }}
          onMouseEnter={(e) => { e.stopPropagation(); e.currentTarget.style.background = '#ff6b35'; e.currentTarget.style.color = '#0c0c14' }}
          onMouseLeave={(e) => { e.stopPropagation(); e.currentTarget.style.background = 'rgba(20,20,35,0.95)'; e.currentTarget.style.color = '#ff6b35' }}
        >↻</button>
      )}

      {/* Injury indicator */}
      {square?.replaced_injury && (
        <span style={{ position: 'absolute', top: 2, left: 4, fontFamily: 'var(--db-font-mono)', fontSize: 7, color: '#ff6b35', opacity: 0.5 }}>♻</span>
      )}
    </button>
  )
})

export default BingoSquare
