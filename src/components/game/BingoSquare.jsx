import { memo, useEffect, useRef, useState } from 'react'
import { hapticLight } from '../../lib/haptics.js'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, getSmartTeamColor } from '../../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (!abbr) return '#3a3a5c'
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#3a3a5c'
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? '#3a3a5c'
  return NBA_TEAM_COLORS[abbr] ?? '#3a3a5c'
}

/** Convert hex to rgba string */
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
  // Fallback: show team abbreviation when no jersey number (common in MLB pre-game)
  const numberDisplay = jerseyNum || teamAbbr || ''
  const { name: playerLabel, stat: statLabel } = parseDisplay(isFree ? '' : displayText)
  // Split "27.5+ PTS" → statNum="27.5+" statType="PTS"
  const statParts = statLabel.match(/^([\d.]+\+?)\s+(.+)$/)
  const statNum  = statParts ? statParts[1] : statLabel
  const statType = statParts ? statParts[2] : ''
  const progressPct = threshold > 0 ? Math.min(100, ((currentValue ?? 0) / threshold) * 100) : 0
  const showProgress = !isLobby && !isFree && threshold > 0

  // ── Marquee scroll for long names ──
  const trackRef = useRef(null)
  const nameRef = useRef(null)
  const [scrollClass, setScrollClass] = useState('')

  useEffect(() => {
    if (isFree) return
    const measure = () => {
      const track = trackRef.current
      const name = nameRef.current
      if (!track || !name) return
      const overflow = name.scrollWidth - track.clientWidth
      if (overflow > 2) {
        name.style.setProperty('--scroll-dist', `-${overflow}px`)
        name.style.setProperty('--scroll-dur', `${10 + overflow * 0.04}s`)
        name.style.animationDelay = `${2 + Math.random() * 4}s`
        setScrollClass('sq-name-scroll')
      }
    }
    if (document.fonts?.ready) document.fonts.ready.then(measure)
    else setTimeout(measure, 200)
  }, [isFree, playerLabel])

  // ── Mark animation ──
  const prevMarkedRef = useRef(marked)
  const [justMarked, setJustMarked] = useState(false)

  useEffect(() => {
    if (marked && !prevMarkedRef.current) {
      setJustMarked(true)
      hapticLight()
      const t = setTimeout(() => setJustMarked(false), 600)
      prevMarkedRef.current = marked
      return () => clearTimeout(t)
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
        className={`sq-free-glow ${isWinning ? 'sq-winning-square' : ''} ${isLineFlash ? 'sq-line-flash' : ''}`}
        style={{
          width: '100%', aspectRatio: '1', borderRadius: 6,
          background: '#ff6b35', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 12px rgba(255,107,53,0.3)',
        }}>
        <span style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 20, fontWeight: 700, color: '#0c0c14',
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
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: '#ff6b35' }}>⟳</span>
      </div>
    )
  }

  // ══════════════════════════════════════════════
  // COLORS — 4A design: team-color identity
  // ══════════════════════════════════════════════

  const numBg = marked
    ? 'rgba(255,107,53,0.20)'
    : hexToRgba(teamColor, 0.30)

  const numTextColor = marked
    ? 'rgba(255,107,53,0.85)'
    : 'var(--db-text-muted)'

  const bg = marked
    ? 'rgba(255,107,53,0.08)'
    : hexToRgba(teamColor, 0.06)

  const borderColor = marked
    ? 'rgba(255,107,53,0.55)'
    : isWinning
      ? 'rgba(255,107,53,0.45)'
      : hexToRgba(teamColor, 0.20)

  const shadow = marked
    ? '0 0 8px rgba(255,107,53,0.15)'
    : isWinning
      ? '0 0 10px rgba(255,107,53,0.15)'
      : 'none'

  // ══════════════════════════════════════════════
  // RENDER — Number block left, name + stat right
  // ══════════════════════════════════════════════
  return (
    <button type="button"
      onClick={() => { if (longPressFired.current) return; onClick?.(square, index) }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={cancelLongPress}
      onContextMenu={(e) => { if (isLobby) e.preventDefault() }}
      className={`${isLineFlash ? 'sq-line-flash' : ''} ${justMarked ? 'sq-just-marked' : ''} ${isWinning ? 'sq-winning-square' : ''}`}
      style={{
        width: '100%', aspectRatio: '1', borderRadius: 6,
        display: 'flex', overflow: 'hidden', position: 'relative',
        background: bg, border: `1.5px solid ${borderColor}`,
        boxShadow: isHighlighted
          ? '0 0 12px rgba(255,107,53,0.5), inset 0 0 8px rgba(255,107,53,0.15)'
          : shadow,
        cursor: 'pointer', padding: 0,
        transition: 'border-color 150ms, box-shadow 150ms, background 150ms, transform 150ms',
        transform: justMarked ? 'scale(1.03)' : isHighlighted ? 'scale(1.05)' : 'scale(1)',
      }}
    >
      {/* ── Left number panel: team-colored block ── */}
      <div style={{
        width: '30%', flexShrink: 0,
        background: numBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRight: `1px solid ${marked ? 'rgba(255,107,53,0.15)' : hexToRgba(teamColor, 0.12)}`,
      }}>
        <span style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: jerseyNum ? 26 : 14,
          fontWeight: 700, lineHeight: 1,
          color: numTextColor,
          letterSpacing: jerseyNum ? 0 : '0.04em',
        }}>{numberDisplay}</span>
      </div>

      {/* ── Right side: player name + stat ── */}
      <div style={{
        flex: 1, padding: '3px 3px 6px 4px', minWidth: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start', gap: 1,
      }}>
        {/* Player name */}
        <div ref={trackRef} style={{ overflow: 'hidden', height: 18, width: '100%' }}>
          <span ref={nameRef} className={`sq-player ${scrollClass}`}
            style={{
              fontFamily: "'JetBrains Mono',monospace",
              fontWeight: 800, lineHeight: '18px',
              color: marked ? '#ff6b35' : 'var(--db-text-primary)',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              display: 'inline-block', textAlign: 'left',
            }}>{playerLabel}</span>
        </div>

        {/* Stat — two lines: number then abbreviation */}
        <span style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontWeight: 700, whiteSpace: 'nowrap',
          color: marked ? 'rgba(255,140,80,0.7)' : 'var(--db-text-secondary)',
          lineHeight: 1.15, textAlign: 'left',
          display: 'block',
        }} className="sq-stat">{statNum}</span>
        {statType && (
          <span style={{
            fontFamily: "'JetBrains Mono',monospace",
            fontWeight: 600, whiteSpace: 'nowrap',
            color: marked ? 'rgba(255,140,80,0.5)' : 'var(--db-text-ghost)',
            lineHeight: 1, textAlign: 'left',
            display: 'block',
          }} className="sq-stat-type">{statType}</span>
        )}
      </div>

      {/* ── Progress bar (bottom, full width) ── */}
      {showProgress && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'var(--db-bg-elevated)',
        }}>
          <div style={{
            width: marked ? '100%' : `${progressPct}%`,
            height: '100%',
            background: marked
              ? 'linear-gradient(90deg, #ff8855, #ff6b35)'
              : `linear-gradient(90deg, ${hexToRgba(teamColor, 0.5)}, ${teamColor})`,
            transition: 'width 0.5s ease-out',
          }} />
        </div>
      )}

      {/* Static team-color bar when no progress tracking */}
      {!showProgress && !marked && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: teamColor, opacity: 0.35,
        }} />
      )}

      {/* Marked: orange bottom bar */}
      {!showProgress && marked && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: '#ff6b35', opacity: 0.7,
        }} />
      )}

      {/* Injury swap badge */}
      {square?.replaced_injury && (
        <span style={{
          position: 'absolute', top: 1, right: 3, zIndex: 2,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#ff6b35', opacity: 0.5,
        }}>♻</span>
      )}
    </button>
  )
})

export default BingoSquare
