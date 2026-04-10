import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticLight, hapticMedium, hapticHeavy } from '../lib/haptics.js'
import { createDailySeed } from '../lib/dailySeed.js'

// ── Constants (pixel space: 340 × 520) ──
const GAME_DURATION = 60
const COURT_W = 340
const COURT_H = 520
const BALL_R = 16

// Hoop is fixed in upper portion of court
const HOOP = {
  cx: 170,              // center X
  cy: 130,              // center Y
  rimHalf: 34,          // half-span of rim opening
  dotR: 5,              // each rim-edge collision circle radius
  get leftRim() { return { x: this.cx - this.rimHalf, y: this.cy } },
  get rightRim() { return { x: this.cx + this.rimHalf, y: this.cy } },
  // Scoring gate: horizontal band between inner edges of rim dots
  get gateLeft() { return this.cx - this.rimHalf + this.dotR },
  get gateRight() { return this.cx + this.rimHalf - this.dotR },
  gateYTop: 126,
  gateYBottom: 142,
  // Backboard
  bbTop: 90, bbBottom: 122, bbLeft: 125, bbRight: 215,
}

const COLLISION_DIST = BALL_R + HOOP.dotR
const GRAVITY = 0.42
const RESTITUTION = 0.52
const FRICTION = 0.78
const MAX_FRAMES = 200

// Ball scale: large at bottom (near you), small at hoop height (far away)
function ballScale(y) {
  const t = Math.max(0, Math.min(1, (y - HOOP.cy) / (460 - HOOP.cy)))
  return 0.55 + t * 0.85 // 0.55 at hoop, 1.4 at bottom
}

// ── Generate ball start positions for the day ──
function generateShotSequence(seed, count = 50) {
  const shots = []
  for (let i = 0; i < count; i++) {
    const x = seed.range(70, 270)
    const y = 450 // fixed bottom area
    const dist = Math.abs(x - HOOP.cx)
    let multiplier = 1
    if (dist > 100) multiplier = 2
    else if (dist > 60) multiplier = 1.5
    shots.push({ ballStartX: x, ballStartY: y, multiplier })
  }
  return shots
}

// ── Rim collision resolution ──
function resolveRimCollision(x, y, vx, vy, rimX, rimY) {
  const dx = x - rimX
  const dy = y - rimY
  const dist = Math.sqrt(dx * dx + dy * dy)
  if (dist < 0.01) return { x, y, vx, vy, hit: false }
  if (dist >= COLLISION_DIST) return { x, y, vx, vy, hit: false }

  // Push ball out of overlap
  const nx = dx / dist
  const ny = dy / dist
  const overlap = COLLISION_DIST - dist
  x += nx * overlap * 1.01
  y += ny * overlap * 1.01

  // Decompose velocity
  const vDotN = vx * nx + vy * ny
  if (vDotN > 0) return { x, y, vx, vy, hit: false } // moving away

  const vnx = vDotN * nx
  const vny = vDotN * ny
  const vtx = vx - vnx
  const vty = vy - vny

  // Reflect with restitution + friction
  vx = vtx * FRICTION + (-vnx * RESTITUTION)
  vy = vty * FRICTION + (-vny * RESTITUTION)

  return { x, y, vx, vy, hit: true }
}

// ── Physics simulation ──
function simulateShot(startX, startY, velX, velY) {
  const frames = []
  let x = startX, y = startY, vx = velX, vy = velY
  let collisionCount = 0
  let outcome = 'miss'
  const collisionPoints = []
  let lastCollidedRim = null
  let framesSinceCollision = 99

  for (let i = 0; i < MAX_FRAMES; i++) {
    x += vx
    y += vy
    vy += GRAVITY
    framesSinceCollision++

    // Backboard bounce
    if (y >= HOOP.bbTop && y <= HOOP.bbBottom && x >= HOOP.bbLeft && x <= HOOP.bbRight && vy < 0) {
      vy = -vy * 0.4
      y = HOOP.bbBottom + 1
    }

    // Left rim collision
    if (lastCollidedRim !== 'left' || framesSinceCollision > 3) {
      const r = resolveRimCollision(x, y, vx, vy, HOOP.leftRim.x, HOOP.leftRim.y)
      if (r.hit) {
        x = r.x; y = r.y; vx = r.vx; vy = r.vy
        collisionCount++
        collisionPoints.push({ x, y, frame: i })
        lastCollidedRim = 'left'
        framesSinceCollision = 0
        if (collisionCount > 5) vy += 0.6
      }
    }

    // Right rim collision
    if (lastCollidedRim !== 'right' || framesSinceCollision > 3) {
      const r = resolveRimCollision(x, y, vx, vy, HOOP.rightRim.x, HOOP.rightRim.y)
      if (r.hit) {
        x = r.x; y = r.y; vx = r.vx; vy = r.vy
        collisionCount++
        collisionPoints.push({ x, y, frame: i })
        lastCollidedRim = 'right'
        framesSinceCollision = 0
        if (collisionCount > 5) vy += 0.6
      }
    }

    frames.push({ x, y })

    // Scoring gate: ball moving downward through the rim opening
    if (vy > 0 && y >= HOOP.gateYTop && y <= HOOP.gateYBottom) {
      if (x >= HOOP.gateLeft && x <= HOOP.gateRight) {
        outcome = collisionCount === 0 ? 'swish' : 'rim_in'
        break
      }
    }

    // Out of bounds
    if (y > startY + 30 || x < -30 || x > COURT_W + 30 || (y > HOOP.cy + 60 && vy > 0 && i > 30)) break
  }

  return { frames, outcome, collisionCount, collisionPoints }
}

export default function FlickToScorePage() {
  const { user } = useAuth()
  const { activity, reload: reloadActivity } = useDailyActivity()
  const alreadyDone = activity?.flick_completed

  const seed = useMemo(() => createDailySeed('flick'), [])
  const shotSequence = useMemo(() => generateShotSequence(seed), [seed])

  const [gameState, setGameState] = useState('ready')
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [coins, setCoins] = useState(0)
  const [shotIndex, setShotIndex] = useState(0)
  const [stats, setStats] = useState({ shots: 0, makes: 0, swishes: 0, misses: 0 })

  // Drag state
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState(null)
  const [dragCurrent, setDragCurrent] = useState(null)

  // Shot animation
  const [shotFrames, setShotFrames] = useState(null)
  const [shotFrameIdx, setShotFrameIdx] = useState(0)
  const [shotResult, setShotResult] = useState(null)
  const [resultText, setResultText] = useState('')
  const [showingResult, setShowingResult] = useState(false)
  const [collisionSparks, setCollisionSparks] = useState([])
  const [scoreBump, setScoreBump] = useState(0) // increment to trigger pulse

  // End screen count-up
  const [displayCoins, setDisplayCoins] = useState(0)
  const [countDone, setCountDone] = useState(false)

  const timerRef = useRef(null)
  const animRef = useRef(null)
  const courtRef = useRef(null)

  const currentShot = shotSequence[shotIndex] ?? shotSequence[0]

  // Convert pixel event coords to court pixel space
  const getCoordsPx = useCallback((e) => {
    const rect = courtRef.current?.getBoundingClientRect()
    if (!rect) return null
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return {
      x: ((clientX - rect.left) / rect.width) * COURT_W,
      y: ((clientY - rect.top) / rect.height) * COURT_H,
    }
  }, [])

  const handleDragStart = useCallback((e) => {
    if (gameState !== 'playing' || showingResult) return
    e.preventDefault()
    const coords = getCoordsPx(e)
    if (!coords) return
    const dx = coords.x - currentShot.ballStartX
    const dy = coords.y - currentShot.ballStartY
    if (Math.sqrt(dx * dx + dy * dy) > 60) return // must touch near ball
    setDragging(true)
    setDragStart(coords)
    setDragCurrent(coords)
  }, [gameState, showingResult, getCoordsPx, currentShot])

  const handleDragMove = useCallback((e) => {
    if (!dragging) return
    e.preventDefault()
    const coords = getCoordsPx(e)
    if (coords) setDragCurrent(coords)
  }, [dragging, getCoordsPx])

  const handleDragEnd = useCallback((e) => {
    if (!dragging || !dragStart || !dragCurrent) {
      setDragging(false)
      return
    }
    e.preventDefault()
    setDragging(false)

    const dx = dragStart.x - dragCurrent.x
    const dy = dragStart.y - dragCurrent.y
    const dragDist = Math.sqrt(dx * dx + dy * dy)
    if (dragDist < 15) return // too short

    // Convert drag into launch velocity
    const power = Math.min(dragDist * 0.065, 11)
    const angle = Math.atan2(dy, dx)
    const vx = Math.cos(angle) * power * 0.5
    const vy = -Math.abs(Math.sin(angle) * power)

    const result = simulateShot(currentShot.ballStartX, currentShot.ballStartY, vx, vy)

    setShotFrames(result.frames)
    setShotFrameIdx(0)
    setShowingResult(true)
    setCollisionSparks(result.collisionPoints)

    const mult = currentShot.multiplier
    let coinReward = 0
    let resultType = 'miss'
    let text = result.collisionCount > 0 && result.outcome === 'miss' ? 'RIM OUT' : 'MISS'

    if (result.outcome === 'swish') {
      coinReward = Math.round(5 * mult)
      resultType = 'swish'
      text = mult > 1 ? `SWISH! ×${mult}` : 'SWISH!'
      hapticHeavy()
    } else if (result.outcome === 'rim_in') {
      coinReward = Math.round(2 * mult)
      resultType = 'rim_in'
      text = mult > 1 ? `RATTLED IN! ×${mult}` : 'RATTLED IN!'
      hapticMedium()
    } else {
      hapticLight()
    }

    setShotResult(resultType)
    setResultText(text)
    if (coinReward > 0) {
      setCoins((c) => c + coinReward)
      setScoreBump((b) => b + 1)
    }

    setStats((s) => ({
      ...s,
      shots: s.shots + 1,
      makes: s.makes + (result.outcome === 'swish' || result.outcome === 'rim_in' ? 1 : 0),
      swishes: s.swishes + (result.outcome === 'swish' ? 1 : 0),
      misses: s.misses + (result.outcome !== 'swish' && result.outcome !== 'rim_in' ? 1 : 0),
    }))

    // Animate through frames
    let frame = 0
    const lastTs = { current: 0 }
    const animateBall = (ts) => {
      if (ts - lastTs.current < 14) {
        animRef.current = requestAnimationFrame(animateBall)
        return
      }
      lastTs.current = ts
      frame++
      setShotFrameIdx(frame)
      if (frame < result.frames.length) {
        animRef.current = requestAnimationFrame(animateBall)
      } else {
        const delay = result.outcome === 'swish' || result.outcome === 'rim_in' ? 700 : 350
        setTimeout(() => {
          setShotFrames(null)
          setShotResult(null)
          setResultText('')
          setShowingResult(false)
          setCollisionSparks([])
          setShotIndex((i) => i + 1)
        }, delay)
      }
    }
    animRef.current = requestAnimationFrame(animateBall)
  }, [dragging, dragStart, dragCurrent, currentShot])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }
  }, [])

  // End screen dobs count-up
  useEffect(() => {
    if (gameState !== 'ended' && gameState !== 'submitted') return
    if (coins === 0) { setDisplayCoins(0); setCountDone(true); return }
    let frame = 0
    const totalFrames = Math.min(40, coins)
    const step = coins / totalFrames
    const id = setInterval(() => {
      frame++
      setDisplayCoins(Math.min(Math.round(step * frame), coins))
      if (frame >= totalFrames) { clearInterval(id); setCountDone(true) }
    }, 25)
    return () => clearInterval(id)
  }, [gameState, coins])

  const handleSubmit = useCallback(async () => {
    if (!user) return
    setGameState('submitted')
    await supabase.rpc('complete_daily_activity', {
      p_user_id: user.id,
      p_activity: 'flick',
      p_dobs_earned: coins,
    })
    reloadActivity()
  }, [user, coins, reloadActivity])

  const startGame = useCallback(() => {
    setGameState('playing')
    setCoins(0)
    setTimeLeft(GAME_DURATION)
    setShotIndex(0)
    setStats({ shots: 0, makes: 0, swishes: 0, misses: 0 })
    setShotResult(null)
    setShotFrames(null)

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          setGameState('ended')
          return 0
        }
        return t - 1
      })
    }, 1000)
  }, [])

  const shareText = `Flick to Score: ${stats.shots} shots, ${stats.makes} makes, ${stats.swishes} swishes, ${coins} coins 🏀`

  // ── Already completed ──
  if (alreadyDone && gameState === 'ready') {
    return (
      <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <Link to="/daily/games" className="back-btn" aria-label="Back">← Back</Link>
          <h1 style={titleStyle}>FLICK TO SCORE</h1>
        </div>
        <div style={completedCardStyle}>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)', color: 'var(--db-success)' }}>
            COMPLETED TODAY
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)', display: 'block', marginTop: 8 }}>
            Earned {activity.flick_dobs_earned} ◈ · Come back tomorrow!
          </span>
        </div>
      </main>
    )
  }

  // ── Ready screen ──
  if (gameState === 'ready') {
    return (
      <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <Link to="/daily/games" className="back-btn" aria-label="Back">← Back</Link>
          <h1 style={titleStyle}>FLICK TO SCORE</h1>
          <p style={subtitleStyle}>
            Look up at the hoop. Drag the ball upward to shoot. {GAME_DURATION} seconds.
          </p>
        </div>

        {/* Court preview */}
        <div style={{
          margin: '0 20px', borderRadius: 14, overflow: 'hidden',
          background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1528 40%, #162040 100%)',
          border: '1px solid var(--db-border-subtle)',
          height: 280, position: 'relative',
        }}>
          {/* Hoop preview — 3/4 looking-up view */}
          <div style={{ position: 'absolute', top: '22%', left: '50%', transform: 'translateX(-50%)' }}>
            <HoopView />
          </div>
          {/* Ball preview */}
          <div className="idle-bob" style={{ position: 'absolute', bottom: '10%', left: '50%', transform: 'translateX(-50%) scale(1.3)' }}>
            <Basketball size={40} />
          </div>
          <div style={{
            position: 'absolute', bottom: '22%', left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
            color: 'rgba(255,255,255,0.2)', letterSpacing: 'var(--db-tracking-widest)',
          }}>↑ FLICK UP</div>
        </div>

        <div style={{ padding: '20px' }}>
          <button type="button" onClick={startGame} className="game-start-btn" style={{
            ...startButtonStyle,
            background: 'linear-gradient(135deg, #c45e2a, #e87c3f)',
          }}>
            START SHOOTING
          </button>
        </div>
      </main>
    )
  }

  // ── Playing screen ──
  if (gameState === 'playing') {
    // Ball position in pixel space
    let ballPx = { x: currentShot.ballStartX, y: currentShot.ballStartY }
    if (shotFrames && shotFrameIdx < shotFrames.length) {
      ballPx = shotFrames[shotFrameIdx]
    }
    const bScale = ballScale(ballPx.y)

    // Drag aim visualization (in pixel space)
    const dragDx = dragStart && dragCurrent ? dragStart.x - dragCurrent.x : 0
    const dragDy = dragStart && dragCurrent ? dragStart.y - dragCurrent.y : 0
    const dragDist = Math.sqrt(dragDx * dragDx + dragDy * dragDy)

    // Convert to percentages for rendering
    const pct = (px, dim) => (px / dim) * 100

    return (
      <main style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        {/* HUD */}
        <div style={{
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              key={scoreBump}
              className={scoreBump > 0 ? 'hud-score-bump' : undefined}
              style={{
                fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-2xl)',
                color: 'var(--db-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              }}
            >{coins}</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)', color: 'var(--db-text-muted)' }}>◈</span>
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)', color: 'var(--db-text-ghost)',
            }}>{stats.makes}/{stats.shots}</span>
          </div>
          <span
            className={timeLeft <= 10 ? 'timer-urgent' : undefined}
            style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xl)',
              fontWeight: 'var(--db-weight-bold)', fontVariantNumeric: 'tabular-nums',
              color: timeLeft <= 10 ? 'var(--db-live)' : 'var(--db-text-primary)',
            }}
          >{timeLeft}s</span>
        </div>

        {/* Court — looking up at the hoop */}
        <div
          ref={courtRef}
          onMouseDown={handleDragStart}
          onMouseMove={handleDragMove}
          onMouseUp={handleDragEnd}
          onMouseLeave={() => { if (dragging) setDragging(false) }}
          onTouchStart={handleDragStart}
          onTouchMove={handleDragMove}
          onTouchEnd={handleDragEnd}
          style={{
            margin: '0 20px', borderRadius: 14, overflow: 'hidden',
            background: 'linear-gradient(180deg, #0a0e1a 0%, #0f1528 30%, #162040 60%, #1a2848 100%)',
            border: '1px solid var(--db-border-subtle)',
            height: COURT_H, position: 'relative',
            cursor: dragging ? 'grabbing' : 'grab',
            userSelect: 'none', WebkitUserSelect: 'none',
            touchAction: 'none',
          }}
        >
          {/* Subtle radial light from above (where the hoop is) */}
          <div style={{
            position: 'absolute', inset: 0, pointerEvents: 'none',
            background: 'radial-gradient(ellipse 60% 40% at 50% 20%, rgba(255,255,255,0.03) 0%, transparent 70%)',
          }} />

          {/* Looking-up floor lines (receding perspective) */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '120%', height: '55%',
            background: 'repeating-linear-gradient(90deg, transparent, transparent 14%, rgba(255,255,255,0.015) 14%, rgba(255,255,255,0.015) 14.3%)',
            pointerEvents: 'none', opacity: 0.5,
          }} />

          {/* Hoop (fixed position) */}
          <div style={{
            position: 'absolute',
            left: `${pct(HOOP.cx, COURT_W)}%`,
            top: `${pct(HOOP.cy, COURT_H)}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none', zIndex: 3,
          }}>
            <HoopView glowing={shotResult === 'swish' || shotResult === 'rim_in'} wobble={shotResult === 'swish' || shotResult === 'rim_in'} />

            {/* Multiplier badge */}
            {currentShot.multiplier > 1 && (
              <div style={{
                position: 'absolute', top: -22, left: '50%', transform: 'translateX(-50%)',
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                fontWeight: 'var(--db-weight-bold)',
                color: currentShot.multiplier >= 2 ? 'var(--db-primary)' : '#ffaa44',
                background: currentShot.multiplier >= 2 ? 'rgba(255,107,53,0.2)' : 'rgba(255,170,68,0.15)',
                padding: '1px 6px', borderRadius: 4, whiteSpace: 'nowrap',
              }}>×{currentShot.multiplier}</div>
            )}
          </div>

          {/* Ball */}
          {(!shotFrames || shotFrameIdx < (shotFrames?.length ?? 0)) && (
            <div style={{
              position: 'absolute',
              left: `${pct(ballPx.x, COURT_W)}%`,
              top: `${pct(ballPx.y, COURT_H)}%`,
              transform: `translate(-50%, -50%) scale(${bScale})`,
              zIndex: shotFrames ? 6 : 5,
              pointerEvents: 'none',
              transition: shotFrames ? 'none' : 'left 50ms ease, top 50ms ease',
            }}>
              <Basketball size={BALL_R * 2} />
            </div>
          )}

          {/* Collision sparks */}
          {collisionSparks.map((spark, i) => {
            const frameDiff = shotFrameIdx - spark.frame
            if (frameDiff < 0 || frameDiff > 10) return null
            const opacity = 1 - frameDiff / 10
            return (
              <div key={i} style={{
                position: 'absolute',
                left: `${pct(spark.x, COURT_W)}%`,
                top: `${pct(spark.y, COURT_H)}%`,
                transform: 'translate(-50%, -50%)',
                width: 12 + frameDiff * 2, height: 12 + frameDiff * 2,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(255,107,53,${opacity * 0.6}) 0%, transparent 70%)`,
                pointerEvents: 'none', zIndex: 7,
              }} />
            )
          })}

          {/* Drag aim line */}
          {dragging && dragDist > 10 && (
            <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }}
              viewBox={`0 0 ${COURT_W} ${COURT_H}`} preserveAspectRatio="none">
              {/* Direction indicator */}
              <line
                x1={currentShot.ballStartX}
                y1={currentShot.ballStartY}
                x2={currentShot.ballStartX + dragDx * 0.4}
                y2={currentShot.ballStartY + dragDy * 0.4}
                stroke="rgba(255,107,53,0.35)"
                strokeWidth="1.5"
                strokeDasharray="4,4"
              />
              {/* Power ring */}
              <circle
                cx={currentShot.ballStartX}
                cy={currentShot.ballStartY}
                r={Math.min(dragDist * 0.25, 30)}
                fill="none"
                stroke="rgba(255,107,53,0.2)"
                strokeWidth="1"
              />
            </svg>
          )}

          {/* Result text */}
          {resultText && (
            <div
              key={stats.shots}
              className="celebrate-pop"
              style={{
                position: 'absolute', top: '38%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontFamily: 'var(--db-font-display)',
                fontSize: shotResult === 'swish' ? 32 : 26,
                fontWeight: 900, letterSpacing: '0.06em',
                color: shotResult === 'swish' ? 'var(--db-primary)'
                  : shotResult === 'rim_in' ? 'var(--db-success)'
                    : 'var(--db-text-muted)',
                textShadow: shotResult === 'swish' ? '0 0 24px rgba(255,107,53,0.8)' : 'none',
                zIndex: 10, pointerEvents: 'none',
              }}
            >
              {resultText}
            </div>
          )}

          {/* Drag hint */}
          {!dragging && !shotFrames && (
            <div style={{
              position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
              color: 'rgba(255,255,255,0.2)', letterSpacing: 'var(--db-tracking-widest)',
              pointerEvents: 'none',
            }}>
              DRAG BALL TO SHOOT
            </div>
          )}
        </div>
      </main>
    )
  }

  // ── End / Submitted screen ──
  const shootingPct = stats.shots > 0 ? Math.round((stats.makes / stats.shots) * 100) : 0

  return (
    <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ padding: '20px 20px 0' }}>
        <h1 style={titleStyle}>GAME OVER</h1>
      </div>

      <div className="celebrate-pop" style={{
        margin: '16px 20px 0', padding: '32px 24px', borderRadius: 14, textAlign: 'center',
        background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
      }}>
        <span style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
          letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
          display: 'block', marginBottom: 8,
        }}>TOTAL EARNED</span>
        <span style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-4xl)',
          color: 'var(--db-primary)', display: 'block', lineHeight: 1,
          ...(countDone ? { animation: 'dobs-count-celebrate 400ms cubic-bezier(0.25, 1, 0.5, 1)' } : {}),
        }}>{displayCoins} ◈</span>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8,
          marginTop: 20, padding: '14px 0', borderTop: '1px solid var(--db-border-subtle)',
        }}>
          {[
            { label: 'Shots', value: stats.shots },
            { label: 'Makes', value: stats.makes },
            { label: 'Swishes', value: stats.swishes },
            { label: 'FG%', value: `${shootingPct}%` },
          ].map(({ label, value }) => (
            <div key={label}>
              <span style={{
                fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
                color: 'var(--db-text-primary)', display: 'block',
              }}>{value}</span>
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                color: 'var(--db-text-muted)',
              }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px 20px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          type="button"
          onClick={() => { navigator.clipboard?.writeText(shareText); hapticLight() }}
          style={shareButtonStyle}
        >
          ↗ SHARE RESULTS
        </button>

        {gameState === 'submitted' ? (
          <Link to="/" style={earnedLinkStyle}>
            ✓ {coins} ◈ EARNED · BACK TO HOME
          </Link>
        ) : (
          <button type="button" onClick={handleSubmit} style={{
            ...startButtonStyle,
            background: 'linear-gradient(135deg, #c45e2a, #e87c3f)',
            boxShadow: '0 4px 16px rgba(232,124,63,0.3)',
          }}>
            COLLECT {coins} ◈
          </button>
        )}
      </div>
    </main>
  )
}

// ── Sub-components ──

function Basketball({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#e87c3f" stroke="#c45e2a" strokeWidth="1.5" />
      <path d="M2 16 h28 M16 2 v28" stroke="#c45e2a" strokeWidth="0.8" opacity="0.6" />
      <path d="M5 5 Q16 16 5 27 M27 5 Q16 16 27 27" stroke="#c45e2a" strokeWidth="0.8" fill="none" opacity="0.4" />
    </svg>
  )
}

function HoopView({ glowing = false, wobble = false }) {
  // 3/4 looking-up perspective: rim is a foreshortened oval, net hangs down
  const rimW = 76
  const rimH = 18
  return (
    <div style={{ position: 'relative', width: rimW + 16, height: 70 }}>
      {/* Backboard — seen from below, wide rectangle behind rim */}
      <div style={{
        position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
        width: rimW + 10, height: 22,
        border: '2px solid rgba(255,255,255,0.2)',
        borderRadius: 2,
        background: 'rgba(255,255,255,0.04)',
      }} />

      {/* Rim oval — foreshortened circle from below */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        width: rimW, height: rimH,
        border: `3px solid ${glowing ? '#ff6644' : '#ff4444'}`,
        borderRadius: '50%',
        boxShadow: glowing
          ? '0 0 16px rgba(255,68,68,0.7), inset 0 0 8px rgba(255,68,68,0.3)'
          : '0 2px 8px rgba(255,68,68,0.3)',
        background: 'transparent',
      }} />

      {/* Rim dot markers (collision points) */}
      <div style={{
        position: 'absolute', top: 22, left: 3,
        width: 8, height: 8, borderRadius: '50%',
        background: glowing ? '#ff6644' : '#cc3333',
      }} />
      <div style={{
        position: 'absolute', top: 22, right: 3,
        width: 8, height: 8, borderRadius: '50%',
        background: glowing ? '#ff6644' : '#cc3333',
      }} />

      {/* Net — SVG strings hanging down from rim */}
      <svg
        style={{
          position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)',
          ...(wobble ? { animation: 'net-wobble 0.6s ease-out' } : {}),
        }}
        width={rimW - 6} height={38} viewBox={`0 0 ${rimW - 6} 38`}
      >
        {/* Vertical net strings */}
        {[0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1].map((t, i) => {
          const topX = t * (rimW - 6)
          const bottomX = 12 + t * (rimW - 30)
          return (
            <line key={i}
              x1={topX} y1={0}
              x2={bottomX} y2={36}
              stroke="rgba(255,255,255,0.1)"
              strokeWidth="0.8"
            />
          )
        })}
        {/* Horizontal cross strings */}
        {[10, 20, 30].map((y, i) => {
          const shrink = y / 36
          const left = 4 + shrink * 8
          const right = (rimW - 6) - 4 - shrink * 8
          return (
            <line key={`h${i}`}
              x1={left} y1={y}
              x2={right} y2={y}
              stroke="rgba(255,255,255,0.06)"
              strokeWidth="0.6"
            />
          )
        })}
      </svg>
    </div>
  )
}

// ── Shared styles ──
const titleStyle = {
  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
  fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
  color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)',
  margin: '8px 0 4px',
}

const subtitleStyle = {
  fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
  color: 'var(--db-text-muted)', margin: '0 0 24px',
}

const completedCardStyle = {
  margin: '0 20px', padding: '40px 24px', borderRadius: 14, textAlign: 'center',
  background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
}

const startButtonStyle = {
  width: '100%', padding: '18px', borderRadius: 10, border: 'none',
  background: 'var(--db-gradient-primary)', color: '#fff',
  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
  fontWeight: 'var(--db-weight-extrabold)', letterSpacing: 'var(--db-tracking-wide)',
  cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,107,53,0.3)',
}

const shareButtonStyle = {
  width: '100%', padding: '14px', borderRadius: 10,
  background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.2)',
  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
  letterSpacing: 'var(--db-tracking-wide)',
  color: 'var(--db-primary)', cursor: 'pointer',
}

const earnedLinkStyle = {
  display: 'block', padding: '16px', borderRadius: 10, textAlign: 'center',
  background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
  textDecoration: 'none',
  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
  letterSpacing: 'var(--db-tracking-wide)', color: 'var(--db-success)',
}
