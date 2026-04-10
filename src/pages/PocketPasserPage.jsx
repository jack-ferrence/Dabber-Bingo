import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticLight, hapticMedium, hapticHeavy } from '../lib/haptics.js'
import { createDailySeed } from '../lib/dailySeed.js'

// ── Constants ──
const TOTAL_PLAYS = 10
const FIELD_W = 100 // percentage-based coordinate system
const FIELD_H = 100

// QB position (bottom-center, behind-QB view looking downfield)
const QB = { x: 50, y: 88 }

// Route definitions — each has a generator that produces 60 waypoints
const ROUTE_DEFS = [
  { name: 'go',       label: 'GO',     yards: 35, dobs: 10, depth: 'deep' },
  { name: 'post',     label: 'POST',   yards: 28, dobs: 10, depth: 'deep' },
  { name: 'corner',   label: 'CORNER', yards: 25, dobs: 8,  depth: 'deep' },
  { name: 'out',      label: 'OUT',    yards: 15, dobs: 5,  depth: 'mid' },
  { name: 'slant',    label: 'SLANT',  yards: 12, dobs: 5,  depth: 'mid' },
  { name: 'drag',     label: 'DRAG',   yards: 8,  dobs: 3,  depth: 'short' },
  { name: 'flat',     label: 'FLAT',   yards: 5,  dobs: 2,  depth: 'short' },
]

// Coverage schemes
const COVERAGES = [
  { name: 'Cover 2',     id: 'cover2',  deepSafeties: 2, weakness: 'deep middle' },
  { name: 'Cover 3',     id: 'cover3',  deepSafeties: 3, weakness: 'sideline seams' },
  { name: 'Man 2-Deep',  id: 'man2deep', deepSafeties: 2, weakness: 'crossing routes' },
]

const STEPS = 60

function buildRoute(name, startX, side, seed) {
  const pts = []
  const dir = side === 'left' ? -1 : 1

  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS
    let x, y

    switch (name) {
      case 'go':
        x = startX + dir * seed.range(-1, 1) * t
        y = QB.y - t * 68
        break
      case 'post':
        x = startX + (t < 0.4 ? dir * t * 5 : dir * 2 + (t - 0.4) * -dir * 30)
        y = QB.y - t * 62
        break
      case 'corner':
        x = startX + (t < 0.4 ? dir * t * 3 : dir * 1.2 + (t - 0.4) * dir * 35)
        y = QB.y - t * 58
        break
      case 'out':
        x = startX + (t < 0.45 ? dir * t * 4 : dir * 1.8 + (t - 0.45) * dir * 50)
        y = QB.y - (t < 0.45 ? t * 40 : 18 + (t - 0.45) * 5)
        break
      case 'slant':
        x = startX - dir * t * 28
        y = QB.y - t * 38
        break
      case 'drag':
        x = startX + (t < 0.3 ? 0 : (t - 0.3) * dir * 55)
        y = QB.y - (t < 0.3 ? t * 25 : 7.5 + (t - 0.3) * 3)
        break
      case 'flat':
        x = startX + dir * t * 32
        y = QB.y - t * 12
        break
      default:
        x = startX
        y = QB.y - t * 30
    }

    pts.push({ x: Math.max(4, Math.min(96, x)), y: Math.max(5, Math.min(95, y)) })
  }
  return pts
}

function placeDefenders(coverage, receivers, seed) {
  return receivers.map((rec) => {
    // Base defender follows receiver path with an offset based on coverage
    switch (coverage.id) {
      case 'cover2': {
        // Zone: underneath defenders trail receiver, deep safeties stay high
        const zoneOffset = rec.route.depth === 'deep' ? seed.range(6, 12) : seed.range(2, 5)
        return { followReceiver: true, offset: zoneOffset, reaction: seed.range(0.15, 0.3) }
      }
      case 'cover3': {
        // 3-deep zone: good deep coverage, weaker underneath
        const zoneOffset = rec.route.depth === 'short' ? seed.range(6, 10) : seed.range(2, 5)
        return { followReceiver: true, offset: zoneOffset, reaction: seed.range(0.2, 0.35) }
      }
      case 'man2deep': {
        // Man: defender mirrors receiver tightly
        const manOffset = seed.range(1.5, 4)
        return { followReceiver: true, offset: manOffset, reaction: seed.range(0.08, 0.18) }
      }
      default:
        return { followReceiver: true, offset: 4, reaction: 0.2 }
    }
  })
}

function getDefenderPos(defender, receiverPath, step) {
  // Defender follows receiver with a reaction delay and positional offset
  const delayedStep = Math.max(0, Math.floor(step * (1 - defender.reaction)))
  const recPos = receiverPath[Math.min(delayedStep, receiverPath.length - 1)]
  // Defender sits between receiver and QB (closer to receiver = tighter coverage)
  const toQBx = (QB.x - recPos.x) * 0.15
  const toQBy = (QB.y - recPos.y) * 0.15
  return {
    x: recPos.x + toQBx + (defender.offset * 0.5),
    y: recPos.y + toQBy + (defender.offset * 0.8),
  }
}

function generatePlays(seed) {
  const plays = []
  for (let i = 0; i < TOTAL_PLAYS; i++) {
    const coverage = seed.pick(COVERAGES)
    const receiverCount = seed.int(3, 4)
    const pocketTime = seed.range(3.0, 4.2)
    const blitz = seed.next() < 0.25

    const receivers = []
    for (let r = 0; r < receiverCount; r++) {
      const route = seed.pick(ROUTE_DEFS)
      const side = r % 2 === 0 ? 'right' : 'left'
      const startX = 50 + (side === 'left' ? -1 : 1) * seed.range(12, 32)
      const path = buildRoute(route.name, startX, side, seed)
      receivers.push({ id: r, route, side, startX, path })
    }

    const defenders = placeDefenders(coverage, receivers, seed)

    plays.push({
      receivers,
      defenders,
      coverage,
      pocketTime: blitz ? pocketTime * 0.65 : pocketTime,
      blitz,
    })
  }
  return plays
}

// Calculate throw travel time (frames) based on distance
function throwTravelFrames(fromX, fromY, toX, toY) {
  const dist = Math.sqrt((toX - fromX) ** 2 + (toY - fromY) ** 2)
  // Longer throws take more frames — ~8 frames for short, ~18 for deep
  return Math.round(8 + dist * 0.15)
}

// Determine outcome based on lead accuracy and defender proximity
function determineOutcome(tapX, tapY, receiver, receiverPath, defenderObj, step, seed) {
  // Project where receiver will be when ball arrives
  const travelFrames = throwTravelFrames(QB.x, QB.y, tapX, tapY)
  const arrivalStep = Math.min(step + travelFrames, STEPS)
  const arrivalPos = receiverPath[arrivalStep]

  // Lead accuracy: how close is tap to where receiver will be?
  const leadDist = Math.sqrt((tapX - arrivalPos.x) ** 2 + (tapY - arrivalPos.y) ** 2)

  // Defender position at arrival
  const defPos = getDefenderPos(defenderObj, receiverPath, arrivalStep)
  const defDist = Math.sqrt((arrivalPos.x - defPos.x) ** 2 + (arrivalPos.y - defPos.y) ** 2)

  // Separation: how open is the receiver from the defender?
  const separation = defDist

  // Lead accuracy thresholds
  if (leadDist > 22) {
    return { type: 'overthrown', text: 'OVERTHROWN', dobs: 0 }
  }

  if (leadDist > 15) {
    // Bad lead — either incomplete or INT
    if (separation < 4) {
      return { type: 'interception', text: 'INTERCEPTED!', dobs: -5 }
    }
    return { type: 'incomplete', text: 'INCOMPLETE', dobs: 0 }
  }

  if (leadDist > 9) {
    // Decent lead — contested
    if (separation < 3) {
      return seed.next() < 0.6
        ? { type: 'interception', text: 'PICKED OFF!', dobs: -5 }
        : { type: 'incomplete', text: 'BROKEN UP', dobs: 0 }
    }
    if (separation < 6) {
      return seed.next() < 0.5
        ? { type: 'completion', text: `${receiver.route.yards} YD GAIN`, dobs: receiver.route.dobs }
        : { type: 'incomplete', text: 'DROPPED', dobs: 0 }
    }
    return { type: 'completion', text: `${receiver.route.yards} YD GAIN`, dobs: receiver.route.dobs }
  }

  // Good lead (leadDist <= 9)
  if (separation < 2.5) {
    // Tight coverage even with good throw
    return seed.next() < 0.3
      ? { type: 'incomplete', text: 'TIGHT COVERAGE', dobs: 0 }
      : { type: 'completion', text: `${receiver.route.yards} YD GAIN!`, dobs: receiver.route.dobs }
  }

  // Good lead + open = completion
  const isPerfect = leadDist < 5 && separation > 5
  if (isPerfect) {
    return { type: 'completion', text: `${receiver.route.yards} YD DIME!`, dobs: receiver.route.dobs + 2, perfect: true }
  }

  return { type: 'completion', text: `${receiver.route.yards} YD GAIN`, dobs: receiver.route.dobs }
}

// Find closest receiver to a tap point
function findTargetReceiver(tapX, tapY, receivers, currentStep) {
  let best = -1
  let bestDist = Infinity

  for (let i = 0; i < receivers.length; i++) {
    const pos = receivers[i].path[currentStep]
    if (!pos) continue
    // Check proximity ahead of receiver (lead zone)
    const nextStep = Math.min(currentStep + 10, STEPS)
    const futurePos = receivers[i].path[nextStep]
    // Distance to current or nearby future positions
    const d1 = Math.sqrt((tapX - pos.x) ** 2 + (tapY - pos.y) ** 2)
    const d2 = Math.sqrt((tapX - futurePos.x) ** 2 + (tapY - futurePos.y) ** 2)
    const d = Math.min(d1, d2)
    if (d < bestDist && d < 28) { // must be within 28% of a receiver or lead zone
      bestDist = d
      best = i
    }
  }
  return best
}

// ── Component ──

export default function PocketPasserPage() {
  const { user } = useAuth()
  const { activity, reload: reloadActivity } = useDailyActivity()
  const alreadyDone = activity?.passer_completed

  const seed = useMemo(() => createDailySeed('passer'), [])
  const plays = useMemo(() => generatePlays(seed), [seed])

  const [gameState, setGameState] = useState('ready') // ready | playing | ended | submitted
  const [playIndex, setPlayIndex] = useState(0)
  const [dobs, setDobs] = useState(0)
  const [playState, setPlayState] = useState('waiting') // waiting | running | thrown | result
  const [routeStep, setRouteStep] = useState(0)
  const [pocketFrac, setPocketFrac] = useState(0)
  const [playResult, setPlayResult] = useState(null)
  const [throwAnim, setThrowAnim] = useState(null) // { fromX, fromY, toX, toY, progress }
  const [stats, setStats] = useState({
    completions: 0, interceptions: 0, sacks: 0, totalYards: 0, longestThrow: 0,
  })
  const [scoreBump, setScoreBump] = useState(0)
  const [displayDobs, setDisplayDobs] = useState(0)
  const [countDone, setCountDone] = useState(false)

  const animRef = useRef(null)
  const playStartRef = useRef(0)
  const currentStepRef = useRef(0)
  const throwSeedRef = useRef(null)

  const currentPlay = plays[playIndex]

  // Clean up on unmount
  useEffect(() => {
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [])

  // End screen dobs count-up
  useEffect(() => {
    if (gameState !== 'ended' && gameState !== 'submitted') return
    if (dobs === 0) { setDisplayDobs(0); setCountDone(true); return }
    let frame = 0
    const totalFrames = Math.min(40, dobs)
    const step = dobs / totalFrames
    const id = setInterval(() => {
      frame++
      setDisplayDobs(Math.min(Math.round(step * frame), dobs))
      if (frame >= totalFrames) { clearInterval(id); setCountDone(true) }
    }, 25)
    return () => clearInterval(id)
  }, [gameState, dobs])

  const handleSack = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    hapticLight()
    setStats(s => ({ ...s, sacks: s.sacks + 1 }))
    setPlayResult({ type: 'sack', text: 'SACKED!', dobs: 0, receiverIdx: -1 })
    setPlayState('result')
  }, [])

  const handleSackRef = useRef(handleSack)
  useEffect(() => { handleSackRef.current = handleSack }, [handleSack])

  const startPlay = useCallback(() => {
    setPlayState('running')
    setRouteStep(0)
    setPocketFrac(0)
    setPlayResult(null)
    setThrowAnim(null)
    playStartRef.current = performance.now()
    currentStepRef.current = 0
    throwSeedRef.current = createDailySeed(`passer-throw-${playIndex}`)

    const animate = (now) => {
      const elapsed = (now - playStartRef.current) / 1000
      const play = plays[playIndex]
      if (!play) return

      const pFrac = Math.min(elapsed / play.pocketTime, 1)
      setPocketFrac(pFrac)

      // Route progress maps to steps (routes run full in ~pocketTime seconds)
      const step = Math.min(Math.floor((elapsed / play.pocketTime) * STEPS), STEPS)
      setRouteStep(step)
      currentStepRef.current = step

      if (pFrac >= 1) {
        handleSackRef.current?.()
        return
      }
      animRef.current = requestAnimationFrame(animate)
    }
    animRef.current = requestAnimationFrame(animate)
  }, [playIndex, plays])

  const handleFieldTap = useCallback((e) => {
    if (playState !== 'running') return
    if (animRef.current) cancelAnimationFrame(animRef.current)

    const rect = e.currentTarget.getBoundingClientRect()
    const tapX = ((e.clientX - rect.left) / rect.width) * 100
    const tapY = ((e.clientY - rect.top) / rect.height) * 100

    const step = currentStepRef.current
    const play = plays[playIndex]
    if (!play) return

    const targetIdx = findTargetReceiver(tapX, tapY, play.receivers, step)

    if (targetIdx === -1) {
      // Throwaway — no receiver nearby
      hapticLight()
      setPlayResult({ type: 'throwaway', text: 'THROWN AWAY', dobs: 0, receiverIdx: -1 })
      setPlayState('result')
      return
    }

    const receiver = play.receivers[targetIdx]
    const defObj = play.defenders[targetIdx]
    const throwSeed = throwSeedRef.current || seed

    const outcome = determineOutcome(tapX, tapY, receiver, receiver.path, defObj, step, throwSeed)

    // Animate throw
    const targetPos = receiver.path[Math.min(step + throwTravelFrames(QB.x, QB.y, tapX, tapY), STEPS)]
    setThrowAnim({ toX: targetPos.x, toY: targetPos.y })

    if (outcome.type === 'completion') {
      hapticMedium()
      setDobs(d => d + outcome.dobs)
      setScoreBump(b => b + 1)
      setStats(s => ({
        ...s,
        completions: s.completions + 1,
        totalYards: s.totalYards + receiver.route.yards,
        longestThrow: Math.max(s.longestThrow, receiver.route.yards),
      }))
    } else if (outcome.type === 'interception') {
      hapticHeavy()
      setDobs(d => Math.max(0, d - 5))
      setStats(s => ({ ...s, interceptions: s.interceptions + 1 }))
    } else {
      hapticLight()
    }

    setPlayResult({ ...outcome, receiverIdx: targetIdx })
    setPlayState('result')
  }, [playState, playIndex, plays, seed])

  const nextPlay = useCallback(() => {
    const next = playIndex + 1
    if (next >= TOTAL_PLAYS) {
      setGameState('ended')
    } else {
      setPlayIndex(next)
      setTimeout(() => startPlay(), 300)
    }
  }, [playIndex, startPlay])

  const handleSubmit = useCallback(async () => {
    if (!user) return
    setGameState('submitted')
    await supabase.rpc('complete_daily_activity', {
      p_user_id: user.id,
      p_activity: 'passer',
      p_dobs_earned: dobs,
    })
    reloadActivity()
  }, [user, dobs, reloadActivity])

  const startGame = useCallback(() => {
    setGameState('playing')
    setDobs(0)
    setPlayIndex(0)
    setStats({ completions: 0, interceptions: 0, sacks: 0, totalYards: 0, longestThrow: 0 })
    setTimeout(() => startPlay(), 100)
  }, [startPlay])

  const shareText = `Pocket Passer: ${stats.completions}/${TOTAL_PLAYS} completions, ${stats.totalYards} yds, ${dobs} dobs 🏈`

  // ── Already completed today ──
  if (alreadyDone && gameState === 'ready') {
    return (
      <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <Link to="/daily/games" style={backStyle}>← Back</Link>
          <h1 style={titleStyle}>POCKET PASSER</h1>
        </div>
        <div style={completedCardStyle}>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)', color: 'var(--db-success)' }}>
            COMPLETED TODAY
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)', display: 'block', marginTop: 8 }}>
            Earned {activity.passer_dobs_earned} ◈ · Come back tomorrow!
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
          <Link to="/daily/games" style={backStyle}>← Back</Link>
          <h1 style={titleStyle}>POCKET PASSER</h1>
          <p style={subtitleStyle}>
            Read the defense. Lead the receiver. {TOTAL_PLAYS} plays.
          </p>
        </div>

        {/* Field preview */}
        <div style={fieldContainerStyle}>
          <FieldBackground />
          {/* QB marker */}
          <div className="idle-bob" style={{
            position: 'absolute', left: '50%', top: '88%',
            transform: 'translate(-50%, -50%)',
            width: 24, height: 24, borderRadius: '50%',
            background: '#fff', border: '3px solid var(--db-primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 900, color: '#0c0c14',
            zIndex: 5,
          }}>QB</div>

          {/* Preview receivers */}
          {[
            { x: 30, y: 35 },
            { x: 55, y: 48 },
            { x: 72, y: 28 },
          ].map((r, i) => (
            <div key={i} style={{
              position: 'absolute', left: `${r.x}%`, top: `${r.y}%`,
              transform: 'translate(-50%, -50%)',
              width: 14, height: 14, borderRadius: '50%',
              background: i === 0 ? 'var(--db-primary)' : 'rgba(255,255,255,0.3)',
              boxShadow: i === 0 ? '0 0 10px rgba(255,107,53,0.5)' : 'none',
            }} />
          ))}

          {/* Coverage label preview */}
          <div style={{
            position: 'absolute', top: 8, right: 10,
            fontFamily: 'var(--db-font-mono)', fontSize: 9,
            color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em',
          }}>COVER 2</div>
        </div>

        <div style={{ padding: '20px' }}>
          <button type="button" onClick={startGame} className="game-start-btn" style={{
            ...startButtonStyle,
            background: 'linear-gradient(135deg, #1a5d1a, #2d8b2d)',
          }}>
            SNAP THE BALL
          </button>
        </div>
      </main>
    )
  }

  // ── Playing screen ──
  if (gameState === 'playing') {
    const pocketRadius = Math.max(8, 50 * (1 - pocketFrac * 0.85))
    const pocketDanger = pocketFrac > 0.7

    return (
      <main style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        {/* HUD */}
        <div style={{
          padding: '10px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              key={scoreBump}
              className={scoreBump > 0 ? 'hud-score-bump' : undefined}
              style={{
                fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-2xl)',
                color: 'var(--db-primary)', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
              }}
            >{dobs}</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)', color: 'var(--db-text-muted)' }}>◈</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {currentPlay?.blitz && (
              <span className="blitz-flash" style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 9,
                fontWeight: 800, color: '#ff4444',
                background: 'rgba(255,68,68,0.12)', padding: '2px 8px', borderRadius: 4,
                letterSpacing: '0.08em',
              }}>BLITZ</span>
            )}
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
              color: 'var(--db-text-muted)', fontVariantNumeric: 'tabular-nums',
            }}>
              {playIndex + 1}/{TOTAL_PLAYS}
            </span>
          </div>
        </div>

        {/* Coverage callout */}
        <div style={{
          padding: '0 20px 6px', display: 'flex', justifyContent: 'center',
        }}>
          <span
            key={playIndex}
            style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 10, letterSpacing: '0.12em',
              color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase',
              animation: 'coverage-slide 250ms cubic-bezier(0.25, 1, 0.5, 1)',
            }}
          >
            {currentPlay?.coverage.name}
          </span>
        </div>

        {/* Field */}
        <div
          style={{
            ...fieldContainerStyle,
            height: 420,
            cursor: playState === 'running' ? 'crosshair' : 'default',
            touchAction: 'none',
          }}
          onClick={handleFieldTap}
        >
          <FieldBackground />

          {/* Pocket collapse ring around QB */}
          {playState === 'running' && (
            <div style={{
              position: 'absolute',
              left: `${QB.x}%`, top: `${QB.y}%`,
              transform: 'translate(-50%, -50%)',
              width: pocketRadius * 2 + '%',
              height: pocketRadius * 1.3 + '%',
              borderRadius: '50%',
              border: `2px solid ${pocketDanger ? 'rgba(255,68,68,0.55)' : 'rgba(255,255,255,0.12)'}`,
              background: pocketDanger ? 'rgba(255,68,68,0.06)' : 'transparent',
              transition: 'border-color 200ms, background 200ms',
              pointerEvents: 'none', zIndex: 1,
            }} />
          )}

          {/* QB */}
          <div style={{
            position: 'absolute', left: `${QB.x}%`, top: `${QB.y}%`,
            transform: 'translate(-50%, -50%)',
            width: 22, height: 22, borderRadius: '50%',
            background: '#fff', border: '2px solid rgba(0,0,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--db-font-mono)', fontSize: 8, fontWeight: 900, color: '#0c0c14',
            zIndex: 6, pointerEvents: 'none',
          }}>QB</div>

          {/* Receivers + Defenders */}
          {currentPlay?.receivers.map((rec, idx) => {
            const step = Math.min(routeStep, STEPS)
            const pos = rec.path[step]
            if (!pos) return null

            const defObj = currentPlay.defenders[idx]
            const defPos = getDefenderPos(defObj, rec.path, step)

            const isTarget = playResult?.receiverIdx === idx
            const isCompletion = isTarget && playResult?.type === 'completion'
            const isInt = isTarget && (playResult?.type === 'interception')

            return (
              <div key={rec.id}>
                {/* Route trail (faint line showing where receiver has been) */}
                {playState === 'running' && step > 2 && (
                  <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2 }} viewBox="0 0 100 100" preserveAspectRatio="none">
                    <polyline
                      points={rec.path.slice(Math.max(0, step - 12), step + 1).map(p => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="0.3"
                    />
                  </svg>
                )}

                {/* Defender */}
                <div style={{
                  position: 'absolute',
                  left: `${defPos.x}%`, top: `${defPos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 12, height: 12, borderRadius: '50%',
                  background: isInt ? '#ff4444' : 'rgba(255,100,100,0.55)',
                  border: '1.5px solid rgba(255,100,100,0.3)',
                  transition: 'all 80ms linear',
                  pointerEvents: 'none', zIndex: 3,
                  boxShadow: isInt ? '0 0 10px rgba(255,68,68,0.6)' : 'none',
                }} />

                {/* Receiver dot */}
                <div style={{
                  position: 'absolute',
                  left: `${pos.x}%`, top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  width: 16, height: 16, borderRadius: '50%',
                  background: isCompletion
                    ? 'var(--db-success)'
                    : isInt
                      ? '#ff4444'
                      : 'rgba(255,255,255,0.7)',
                  border: isTarget
                    ? `2px solid ${isCompletion ? 'var(--db-success)' : '#ff4444'}`
                    : '2px solid transparent',
                  transition: 'background 100ms, border 100ms',
                  pointerEvents: 'none', zIndex: 4,
                  boxShadow: isCompletion ? '0 0 12px rgba(34,197,94,0.5)' : isInt ? '0 0 12px rgba(255,68,68,0.5)' : 'none',
                }}>
                  {/* Depth label */}
                  <span style={{
                    position: 'absolute', top: -14, left: '50%', transform: 'translateX(-50%)',
                    fontFamily: 'var(--db-font-mono)', fontSize: 7, fontWeight: 700,
                    color: 'rgba(255,255,255,0.35)', whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                  }}>
                    {rec.route.label}
                  </span>
                </div>

                {/* Dobs popup on completion */}
                {isCompletion && (
                  <div
                    key={`dob-${playIndex}-${idx}`}
                    style={{
                      position: 'absolute',
                      left: `${pos.x}%`, top: `${pos.y - 5}%`,
                      transform: 'translateX(-50%)',
                      fontFamily: 'var(--db-font-display)', fontSize: 18,
                      color: playResult.perfect ? 'var(--db-primary)' : 'var(--db-success)',
                      fontWeight: 900,
                      animation: 'passer-score-pop 0.6s ease-out forwards',
                      pointerEvents: 'none', zIndex: 10,
                    }}
                  >{playResult.perfect ? '◆ ' : ''}+{playResult.dobs}</div>
                )}
              </div>
            )
          })}

          {/* Throw animation — football flying to target */}
          {throwAnim && playState === 'result' && (
            <div style={{
              position: 'absolute',
              left: `${throwAnim.toX}%`, top: `${throwAnim.toY}%`,
              transform: 'translate(-50%, -50%)',
              fontSize: 14,
              animation: 'passer-throw-fly 0.35s ease-out forwards',
              pointerEvents: 'none', zIndex: 8,
            }}>🏈</div>
          )}

          {/* Result overlay */}
          {playResult && (
            <div style={{
              position: 'absolute', top: '40%', left: '50%',
              transform: 'translate(-50%, -50%)',
              fontFamily: 'var(--db-font-display)',
              fontSize: playResult.type === 'completion' && playResult.perfect ? 30 : 26,
              fontWeight: 900, letterSpacing: '0.04em',
              color: playResult.type === 'completion' ? 'var(--db-success)'
                : playResult.type === 'interception' ? '#ff4444'
                  : 'var(--db-text-muted)',
              textShadow: '0 2px 12px rgba(0,0,0,0.8)',
              zIndex: 20, pointerEvents: 'none',
              whiteSpace: 'nowrap', textAlign: 'center',
              animation: 'passer-result-in 0.3s ease-out',
            }}>
              {playResult.text}
              {playResult.dobs !== 0 && (
                <span style={{
                  display: 'block', fontSize: 16, marginTop: 2,
                  color: playResult.dobs > 0 ? 'var(--db-success)' : '#ff4444',
                }}>
                  {playResult.dobs > 0 ? '+' : ''}{playResult.dobs} ◈
                </span>
              )}
            </div>
          )}

          {/* Pocket timer bar at bottom */}
          {playState === 'running' && (
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0, height: 4,
              background: 'rgba(0,0,0,0.3)', zIndex: 15,
            }}>
              <div style={{
                height: '100%',
                width: `${(1 - pocketFrac) * 100}%`,
                background: pocketDanger ? '#ff4444' : pocketFrac > 0.5 ? '#ffaa44' : 'var(--db-success)',
                transition: 'width 100ms linear, background 200ms ease',
              }} />
            </div>
          )}
        </div>

        {/* Next play button */}
        {playState === 'result' && (
          <div style={{ padding: '16px 20px' }}>
            <button type="button" onClick={nextPlay} style={{
              width: '100%', padding: '16px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #1a5d1a, #2d8b2d)',
              color: '#fff',
              fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
              fontWeight: 900, letterSpacing: 'var(--db-tracking-wide)',
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(45,139,45,0.3)',
            }}>
              {playIndex + 1 >= TOTAL_PLAYS ? 'SEE RESULTS' : 'NEXT PLAY →'}
            </button>
          </div>
        )}
      </main>
    )
  }

  // ── End / Submitted screen ──
  const passerRating = Math.min(158.3, Math.round(
    ((stats.completions / TOTAL_PLAYS) * 80 + (stats.totalYards / Math.max(1, stats.completions)) * 1.5 - stats.interceptions * 20) * 1.2
  ))

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
        }}>{displayDobs} ◈</span>

        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
          marginTop: 20, padding: '14px 0', borderTop: '1px solid var(--db-border-subtle)',
        }}>
          {[
            { label: 'Comp', value: `${stats.completions}/${TOTAL_PLAYS}` },
            { label: 'INTs', value: stats.interceptions },
            { label: 'Sacks', value: stats.sacks },
            { label: 'Yards', value: stats.totalYards },
            { label: 'Longest', value: `${stats.longestThrow} yd` },
            { label: 'QBR', value: Math.max(0, passerRating) },
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
          <Link to="/daily/games" style={earnedLinkStyle}>
            ✓ {dobs} ◈ EARNED · BACK TO GAMES
          </Link>
        ) : (
          <button type="button" onClick={handleSubmit} style={{
            ...startButtonStyle,
            background: 'linear-gradient(135deg, #1a5d1a, #2d8b2d)',
            boxShadow: '0 4px 16px rgba(45,139,45,0.3)',
          }}>
            COLLECT {dobs} ◈
          </button>
        )}
      </div>
    </main>
  )
}

// ── Field Background ──
function FieldBackground() {
  return (
    <>
      {/* Yard lines */}
      {[15, 30, 45, 60, 75].map((y) => (
        <div key={y} style={{
          position: 'absolute', top: `${y}%`, left: '4%', right: '4%',
          height: 1, background: 'rgba(255,255,255,0.05)', pointerEvents: 'none',
        }}>
          {/* Hash marks */}
          <div style={{
            position: 'absolute', left: 0, top: -3, width: 1, height: 7,
            background: 'rgba(255,255,255,0.06)',
          }} />
          <div style={{
            position: 'absolute', right: 0, top: -3, width: 1, height: 7,
            background: 'rgba(255,255,255,0.06)',
          }} />
        </div>
      ))}

      {/* Sidelines */}
      <div style={{
        position: 'absolute', top: '8%', bottom: '8%', left: '3%',
        width: 1, background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: '8%', bottom: '8%', right: '3%',
        width: 1, background: 'rgba(255,255,255,0.04)', pointerEvents: 'none',
      }} />

      {/* LOS */}
      <div style={{
        position: 'absolute', top: '80%', left: '4%', right: '4%',
        height: 2, background: 'rgba(66,133,244,0.25)', pointerEvents: 'none',
      }} />
    </>
  )
}

// ── Styles ──

const fieldContainerStyle = {
  margin: '0 20px', borderRadius: 14, overflow: 'hidden',
  background: 'linear-gradient(180deg, #142e14 0%, #1a3d1a 40%, #1e4d1e 70%, #236b23 100%)',
  border: '1px solid rgba(80,160,80,0.15)',
  height: 300, position: 'relative',
  userSelect: 'none', WebkitUserSelect: 'none',
}

const backStyle = {
  fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
  color: 'var(--db-text-muted)', textDecoration: 'none',
  display: 'inline-block', marginBottom: 12,
}

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
