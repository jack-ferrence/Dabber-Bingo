import { memo, useEffect, useRef, useState } from 'react'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS } from '../../constants/teamColors.js'

function getTeamColor(abbr, sport) {
  if (!abbr) return '#3a3a5c'
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#3a3a5c'
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? '#3a3a5c'
  return NBA_TEAM_COLORS[abbr] ?? '#3a3a5c'
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
}) {
  const isFree = index === 12
  const marked = square?.marked === true
  const displayText = square?.display_text ?? ''
  const threshold = Number(square?.threshold) || 0
  const teamAbbr = square?.team_abbr ?? ''
  const teamColor = getTeamColor(teamAbbr, sport)
  const jerseyNum = square?.jersey_number ?? ''
  const { name: playerLabel, stat: statLabel } = parseDisplay(isFree ? '' : displayText)
  const progressPct = threshold > 0 ? Math.min(100, ((currentValue ?? 0) / threshold) * 100) : 0
  const showProgress = !isLobby && !isFree && threshold > 0

  // Marquee: measure after fonts load
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
      if (overflow > 5) {
        name.style.setProperty('--scroll-dist', `-${overflow}px`)
        name.style.setProperty('--scroll-dur', `${10 + overflow * 0.04}s`)
        name.style.animationDelay = `${2 + Math.random() * 4}s`
        setScrollClass('sq-name-scroll')
      }
    }
    if (document.fonts?.ready) document.fonts.ready.then(measure)
    else setTimeout(measure, 200)
  }, [isFree, playerLabel])

  const prevMarkedRef = useRef(marked)
  const [justMarked, setJustMarked] = useState(false)

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

  useEffect(() => {
    if (marked && !prevMarkedRef.current) {
      setJustMarked(true)
      const t = setTimeout(() => setJustMarked(false), 600)
      prevMarkedRef.current = marked
      return () => clearTimeout(t)
    }
    prevMarkedRef.current = marked
  }, [marked])

  const numBg = marked ? 'rgba(255,107,53,0.12)' : `${teamColor}30`
  const numColor = marked ? 'rgba(255,107,53,0.45)' : `${teamColor}80`
  const borderColor = marked
    ? 'rgba(255,107,53,0.5)'
    : isWinning ? 'rgba(255,107,53,0.45)' : `${teamColor}20`
  const bg = marked ? 'rgba(255,107,53,0.06)' : '#1a1a2e'
  const shadow = marked
    ? '0 0 8px rgba(255,107,53,0.1)'
    : isWinning ? '0 0 10px rgba(255,107,53,0.15)' : 'none'

  if (isFree) {
    return (
      <button type="button" onClick={() => onClick?.(square)}
        className={`${isWinning ? 'sq-winning-square' : ''} ${isLineFlash ? 'sq-line-flash' : ''}`}
        style={{
          width: '100%', aspectRatio: '1', borderRadius: 6,
          background: '#ff6b35', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#fff', letterSpacing: '0.1em' }}>FREE</span>
      </button>
    )
  }

  if (isSwapping) {
    return (
      <div style={{
        width: '100%', aspectRatio: '1', borderRadius: 6, background: '#1a1a2e',
        border: '1px solid rgba(255,107,53,0.3)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 14, color: '#ff6b35' }}>⟳</span>
      </div>
    )
  }

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
        boxShadow: shadow, cursor: 'pointer', padding: 0,
        transition: 'border-color 150ms, box-shadow 150ms',
        transform: justMarked ? 'scale(1.03)' : 'scale(1)',
      }}
    >
      {/* Number panel */}
      <div style={{
        width: '26%', flexShrink: 0, background: numBg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{
          fontFamily: "'Bebas Neue',sans-serif",
          fontSize: 20, fontWeight: 700, color: numColor, lineHeight: 1,
        }}>{jerseyNum}</span>
      </div>

      {/* Text */}
      <div style={{
        flex: 1, padding: '3px 5px', minWidth: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
      }}>
        <div ref={trackRef} style={{ overflow: 'hidden', height: 14 }}>
          <span ref={nameRef} className={scrollClass}
            style={{
              fontFamily: "'Oswald',sans-serif",
              fontSize: 12, fontWeight: 600, lineHeight: '14px',
              color: marked ? '#ff6b35' : '#e8e8f4',
              textTransform: 'uppercase', whiteSpace: 'nowrap',
              display: 'inline-block',
            }}>{playerLabel}</span>
        </div>
        <span style={{
          fontFamily: "'JetBrains Mono',monospace",
          fontSize: 9, fontWeight: 700, whiteSpace: 'nowrap',
          color: marked ? 'rgba(255,107,53,0.4)' : '#ff6b35',
        }}>{statLabel}</span>
      </div>

      {/* Progress bar */}
      {showProgress && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: 'rgba(255,255,255,0.05)',
        }}>
          <div style={{
            width: marked ? '100%' : `${progressPct}%`,
            height: '100%', background: marked ? '#ff6b35' : teamColor,
            transition: 'width 0.5s ease-out',
          }} />
        </div>
      )}

      {!showProgress && !marked && (
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 3,
          background: teamColor, opacity: 0.4,
        }} />
      )}

      {square?.replaced_injury && (
        <span style={{
          position: 'absolute', top: 1, right: 3,
          fontFamily: "'JetBrains Mono',monospace", fontSize: 7, color: '#ff6b35', opacity: 0.5,
        }}>♻</span>
      )}
    </button>
  )
})

export default BingoSquare
