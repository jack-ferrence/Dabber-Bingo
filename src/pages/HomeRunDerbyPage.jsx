import { useState, useRef, useCallback, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticLight, hapticMedium, hapticHeavy } from '../lib/haptics.js'
import { createDailySeed } from '../lib/dailySeed.js'

// ── Constants ──
const GAME_DURATION = 30
const SWEET_SPOT = 0.88 // progress value for perfect timing (ball near plate)

// Field layout (percentages of the field container)
const PITCHER_Y = 22   // where ball starts (top %)
const PLATE_Y = 82     // where ball crosses plate (top %)
const CENTER_X = 50    // lateral center

// Strike zone — big and centered
const ZONE_LEFT = 22   // % from left
const ZONE_RIGHT = 78  // % from left
const ZONE_TOP = 62    // % from top
const ZONE_BOTTOM = 88 // % from top

// Ball sizing — starts small, gets thumb-sized
const BALL_BASE = 18   // px at pitcher
const BALL_MAX = 48    // px at plate

// Pitch types
const PITCH_TYPES = [
  { name: 'Fastball',  baseDur: 850,  maxDrift: 3,  minDrop: 0, maxDrop: 2,  latExp: 1.0, dropExp: 1.0, color: '#ff4444', label: 'FB' },
  { name: 'Changeup',  baseDur: 1300, maxDrift: 4,  minDrop: 2, maxDrop: 6,  latExp: 1.0, dropExp: 1.3, color: '#44bbff', label: 'CH' },
  { name: 'Curveball', baseDur: 1400, maxDrift: 5,  minDrop: 6, maxDrop: 12, latExp: 1.8, dropExp: 1.5, color: '#44ff88', label: 'CB' },
  { name: 'Slider',    baseDur: 1050, maxDrift: 14, minDrop: 1, maxDrop: 4,  latExp: 2.2, dropExp: 1.1, color: '#ffaa44', label: 'SL' },
]

// Timing windows (delta from SWEET_SPOT)
const PERFECT_T = 0.05
const GOOD_T = 0.12
const FOUL_T = 0.22

// Location windows (% distance from ball center)
const PERFECT_D = 8
const GOOD_D = 16
const FOUL_D = 26

function generatePitchSequence(seed, count = 80) {
  return Array.from({ length: count }, () => {
    const type = seed.pick(PITCH_TYPES)
    const speedMult = seed.range(0.90, 1.10)
    const sliderDir = seed.next() > 0.5 ? 1 : -1

    return {
      type: type.name,
      durationMs: Math.round(type.baseDur / speedMult),
      finalX: type.name === 'Slider'
        ? sliderDir * seed.range(8, type.maxDrift)
        : seed.range(-type.maxDrift, type.maxDrift),
      finalY: seed.range(type.minDrop, type.maxDrop),
      latExp: type.latExp,
      dropExp: type.dropExp,
      color: type.color,
      label: type.label,
    }
  })
}

// Ball position at progress 0→1
function getBallPosition(pitch, progress) {
  const eased = 1 - Math.pow(1 - progress, 2.2) // ease-out
  const baseY = PITCHER_Y + (PLATE_Y - PITCHER_Y) * eased
  const lateralProgress = Math.pow(progress, pitch.latExp)
  const dropProgress = Math.pow(progress, pitch.dropExp)
  const size = BALL_BASE + (BALL_MAX - BALL_BASE) * Math.pow(progress, 1.5)
  return {
    x: CENTER_X + pitch.finalX * lateralProgress,
    y: baseY + pitch.finalY * dropProgress,
    size,
  }
}

function determineOutcome(timingDelta, distancePct) {
  const timing = timingDelta < PERFECT_T ? 'perfect'
    : timingDelta < GOOD_T ? 'good'
      : timingDelta < FOUL_T ? 'late' : 'miss'

  const location = distancePct < PERFECT_D ? 'perfect'
    : distancePct < GOOD_D ? 'good'
      : distancePct < FOUL_D ? 'ok' : 'miss'

  if (timing === 'perfect' && (location === 'perfect' || location === 'good')) return 'hr'
  if (timing === 'good' && location === 'perfect') return 'hr'
  if (timing === 'good' && (location === 'good' || location === 'ok')) return 'hit'
  if (timing === 'perfect' && location === 'ok') return 'hit'
  if (timing === 'late' && location !== 'miss') return 'foul'
  if (timing !== 'miss' && location === 'miss') return 'foul'
  if (timing === 'late' && location === 'miss') return 'strike'
  return 'strike'
}

export default function HomeRunDerbyPage() {
  const { user } = useAuth()
  const { activity, reload: reloadActivity } = useDailyActivity()
  const alreadyDone = activity?.derby_completed

  const seed = useMemo(() => createDailySeed('derby'), [])
  const pitchSequence = useMemo(() => generatePitchSequence(seed), [seed])

  const [gameState, setGameState] = useState('ready')
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [coins, setCoins] = useState(0)
  const [pitchIndex, setPitchIndex] = useState(0)
  const [stats, setStats] = useState({ homeRuns: 0, hits: 0, fouls: 0, strikes: 0, pitches: 0 })

  const [pitchActive, setPitchActive] = useState(false)
  const [pitchProgress, setPitchProgress] = useState(0)
  const [swingResult, setSwingResult] = useState(null)
  const [resultText, setResultText] = useState('')
  const [resultColor, setResultColor] = useState('')
  const [exitAnim, setExitAnim] = useState(null) // { type, startX, startY }
  const [scoreBump, setScoreBump] = useState(0)
  const [displayCoins, setDisplayCoins] = useState(0)
  const [countDone, setCountDone] = useState(false)
  const [flashColor, setFlashColor] = useState(null)

  const timerRef = useRef(null)
  const pitchAnimRef = useRef(null)
  const canSwing = useRef(false)
  const swungThisPitch = useRef(false)
  const autoNextRef = useRef(null)
  const throwPitchRef = useRef(null)
  const fieldRef = useRef(null)
  const pitchIndexRef = useRef(0)

  // Keep ref in sync so throwPitch always reads the latest pitch
  useEffect(() => { pitchIndexRef.current = pitchIndex }, [pitchIndex])

  const currentPitch = pitchSequence[pitchIndex] ?? pitchSequence[0]

  const handleResult = useCallback((result, ballPos = null, tapX = 50) => {
    const rewards = { hr: 10, hit: 5, foul: 1, strike: 0, looking: 0 }
    const texts = { hr: 'HOME RUN!', hit: 'BASE HIT!', foul: 'FOUL BALL', strike: 'STRIKE!', looking: 'STRIKE!' }
    const colors = { hr: 'var(--db-primary)', hit: 'var(--db-success)', foul: 'var(--db-text-muted)', strike: '#ff4444', looking: '#ff4444' }
    const haptics = { hr: hapticHeavy, hit: hapticMedium, foul: hapticLight, strike: hapticLight, looking: hapticLight }

    haptics[result]?.()
    setSwingResult(result)
    setResultText(texts[result])
    setResultColor(colors[result])

    // Screen flash on contact
    if (result === 'hr') setFlashColor('rgba(255,107,53,0.35)')
    else if (result === 'hit') setFlashColor('rgba(34,197,94,0.2)')
    else setFlashColor(null)

    // Ball exit animation
    if (ballPos && result !== 'strike' && result !== 'looking') {
      const dir = tapX < 50 ? -1 : tapX > 50 ? 1 : 0
      setExitAnim({ type: result, startX: ballPos.x, startY: ballPos.y, dir })
    } else {
      setExitAnim(null)
    }

    if (rewards[result] > 0) {
      setCoins((c) => c + rewards[result])
      setScoreBump((b) => b + 1)
    }

    setStats((s) => ({
      ...s,
      pitches: s.pitches + 1,
      homeRuns: s.homeRuns + (result === 'hr' ? 1 : 0),
      hits: s.hits + (result === 'hit' ? 1 : 0),
      fouls: s.fouls + (result === 'foul' ? 1 : 0),
      strikes: s.strikes + (result === 'strike' || result === 'looking' ? 1 : 0),
    }))

    setPitchActive(false)
    setPitchIndex((i) => i + 1)

    autoNextRef.current = setTimeout(() => {
      throwPitchRef.current?.()
    }, result === 'hr' ? 1200 : 700)
  }, [])

  const throwPitch = useCallback(() => {
    // Read the latest pitch from the ref to avoid stale closures
    const pitch = pitchSequence[pitchIndexRef.current] ?? pitchSequence[0]

    setPitchActive(true)
    setPitchProgress(0)
    setSwingResult(null)
    setResultText('')
    setExitAnim(null)
    setFlashColor(null)
    canSwing.current = true
    swungThisPitch.current = false

    const startTime = performance.now()
    const duration = pitch.durationMs

    const animate = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      setPitchProgress(progress)

      if (progress < 1) {
        pitchAnimRef.current = requestAnimationFrame(animate)
      } else {
        canSwing.current = false
        if (!swungThisPitch.current) handleResult('looking')
      }
    }
    pitchAnimRef.current = requestAnimationFrame(animate)
  }, [pitchSequence, handleResult])

  useEffect(() => { throwPitchRef.current = throwPitch }, [throwPitch])

  // Tap to swing
  const handleFieldTap = useCallback((e) => {
    e.preventDefault() // always prevent to suppress scroll and double-fire
    if (!canSwing.current || swungThisPitch.current) return
    swungThisPitch.current = true
    if (pitchAnimRef.current) cancelAnimationFrame(pitchAnimRef.current)

    const rect = fieldRef.current?.getBoundingClientRect()
    if (!rect) { handleResult('strike'); return }
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    const tapX = ((clientX - rect.left) / rect.width) * 100
    const tapY = ((clientY - rect.top) / rect.height) * 100

    const ball = getBallPosition(currentPitch, pitchProgress)
    const distFromBall = Math.sqrt(Math.pow(tapX - ball.x, 2) + Math.pow(tapY - ball.y, 2))
    const timingDelta = Math.abs(pitchProgress - SWEET_SPOT)

    const result = determineOutcome(timingDelta, distFromBall)
    handleResult(result, ball, tapX)
  }, [pitchProgress, currentPitch, handleResult])

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      if (pitchAnimRef.current) cancelAnimationFrame(pitchAnimRef.current)
      if (autoNextRef.current) clearTimeout(autoNextRef.current)
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
      p_activity: 'derby',
      p_dobs_earned: coins,
    })
    reloadActivity()
  }, [user, coins, reloadActivity])

  const startGame = useCallback(() => {
    setGameState('playing')
    setCoins(0)
    setTimeLeft(GAME_DURATION)
    setPitchIndex(0)
    setStats({ homeRuns: 0, hits: 0, fouls: 0, strikes: 0, pitches: 0 })
    setSwingResult(null)
    setExitAnim(null)
    setFlashColor(null)

    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current)
          if (pitchAnimRef.current) cancelAnimationFrame(pitchAnimRef.current)
          if (autoNextRef.current) clearTimeout(autoNextRef.current)
          setGameState('ended')
          return 0
        }
        return t - 1
      })
    }, 1000)

    autoNextRef.current = setTimeout(() => throwPitch(), 500)
  }, [throwPitch])

  const shareText = `Derby: ${stats.pitches} pitches, ${stats.homeRuns} HRs, ${stats.hits} hits, ${coins} dobs ⚾`

  // ── Already completed ──
  if (alreadyDone && gameState === 'ready') {
    return (
      <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <Link to="/daily/games" className="back-btn" aria-label="Back">← Back</Link>
          <h1 style={titleStyle}>HOME RUN DERBY</h1>
        </div>
        <div style={completedCardStyle}>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)', color: 'var(--db-success)' }}>
            COMPLETED TODAY
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)', display: 'block', marginTop: 8 }}>
            Earned {activity.derby_dobs_earned} ◈ · Come back tomorrow!
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
          <h1 style={titleStyle}>HOME RUN DERBY</h1>
          <p style={subtitleStyle}>
            Tap the ball as it crosses the plate. {GAME_DURATION} seconds. Crush it.
          </p>
        </div>

        {/* Field preview */}
        <div style={{
          margin: '0 20px', borderRadius: 14, overflow: 'hidden',
          height: 280, position: 'relative',
          background: '#1a3a1a',
          border: '1px solid rgba(100,140,60,0.2)',
        }}>
          {/* Sky */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '35%',
            background: 'linear-gradient(180deg, #1a2844 0%, #2a4a2a 100%)',
          }} />
          {/* Ballpark silhouette */}
          <BallparkSilhouette />
          {/* Field grass */}
          <div style={{
            position: 'absolute', top: '30%', left: 0, right: 0, bottom: '22%',
            background: 'linear-gradient(180deg, #2a5a2a 0%, #1e4a1e 100%)',
          }} />
          {/* Dirt infield */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%',
            background: 'linear-gradient(180deg, #5a4030 0%, #4a3525 100%)',
          }} />
          {/* Home plate */}
          <HomePlate y="86%" />
          {/* Pitcher silhouette */}
          <PitcherFigure />
          {/* Preview ball on mound */}
          <div className="idle-bob" style={{
            position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)',
            width: 14, height: 14, borderRadius: '50%', background: '#fff',
            boxShadow: '0 0 10px rgba(255,255,255,0.4)',
          }} />
          {/* Strike zone preview */}
          <div style={{
            position: 'absolute',
            top: `${ZONE_TOP}%`, left: `${ZONE_LEFT}%`,
            width: `${ZONE_RIGHT - ZONE_LEFT}%`, height: `${ZONE_BOTTOM - ZONE_TOP}%`,
            border: '2px dashed rgba(255,255,255,0.12)', borderRadius: 4,
          }} />
        </div>

        <div style={{ padding: '20px' }}>
          <button type="button" onClick={startGame} className="game-start-btn" style={startButtonStyle}>
            PLAY BALL
          </button>
        </div>
      </main>
    )
  }

  // ── Playing screen ──
  if (gameState === 'playing') {
    const ball = pitchActive ? getBallPosition(currentPitch, pitchProgress) : null
    const zoneHighlight = pitchActive && pitchProgress > 0.65

    return (
      <main style={{ maxWidth: 600, margin: '0 auto', userSelect: 'none', WebkitUserSelect: 'none' }}>
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
            >{coins}</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)', color: 'var(--db-text-muted)' }}>◈</span>
            <div style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
              color: 'var(--db-text-ghost)', display: 'flex', gap: 8,
            }}>
              <span>HR:{stats.homeRuns}</span>
              <span>H:{stats.hits}</span>
            </div>
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

        {/* ── FIELD ── */}
        <div
          ref={fieldRef}
          onClick={handleFieldTap}
          onTouchStart={handleFieldTap}
          style={{
            margin: '0 12px', borderRadius: 14, overflow: 'hidden',
            height: 'calc(100vh - 140px)', maxHeight: 560, minHeight: 380,
            position: 'relative',
            background: '#1a3a1a',
            border: '1px solid rgba(100,140,60,0.15)',
            userSelect: 'none', WebkitUserSelect: 'none',
            touchAction: 'none',
            cursor: pitchActive ? 'crosshair' : 'default',
          }}
        >
          {/* Sky gradient */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '30%',
            background: 'linear-gradient(180deg, #0f1e38 0%, #1a3828 100%)',
            pointerEvents: 'none',
          }} />

          {/* Ballpark silhouette */}
          <BallparkSilhouette />

          {/* Outfield grass */}
          <div style={{
            position: 'absolute', top: '25%', left: 0, right: 0, bottom: '22%',
            background: 'linear-gradient(180deg, #2a5a2a 0%, #1e4a1e 60%, #3a6a30 100%)',
            pointerEvents: 'none',
          }} />

          {/* Grass mow stripes */}
          <div style={{
            position: 'absolute', top: '25%', left: 0, right: 0, bottom: '22%',
            background: 'repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(255,255,255,0.015) 20px, rgba(255,255,255,0.015) 21px)',
            pointerEvents: 'none',
          }} />

          {/* Dirt infield area */}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '25%',
            background: 'linear-gradient(180deg, #5a4030 0%, #4a3525 60%, #3d2d1e 100%)',
            pointerEvents: 'none',
          }} />

          {/* Foul lines */}
          <svg style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
            viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="50" y1="92" x2="5" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
            <line x1="50" y1="92" x2="95" y2="18" stroke="rgba(255,255,255,0.06)" strokeWidth="0.4" />
          </svg>

          {/* Home plate */}
          <HomePlate y={`${PLATE_Y + 6}%`} />

          {/* Batter's box lines */}
          <div style={{
            position: 'absolute', top: `${ZONE_TOP - 2}%`, left: `${ZONE_LEFT - 5}%`,
            width: `${ZONE_RIGHT - ZONE_LEFT + 10}%`, height: `${ZONE_BOTTOM - ZONE_TOP + 6}%`,
            pointerEvents: 'none',
          }}>
            {/* Left box line */}
            <div style={{
              position: 'absolute', left: 0, top: '10%', bottom: '10%', width: 1,
              background: 'rgba(255,255,255,0.06)',
            }} />
            {/* Right box line */}
            <div style={{
              position: 'absolute', right: 0, top: '10%', bottom: '10%', width: 1,
              background: 'rgba(255,255,255,0.06)',
            }} />
          </div>

          {/* Pitcher mound */}
          <div style={{
            position: 'absolute', top: '28%', left: '50%', transform: 'translateX(-50%)',
            width: 36, height: 16, borderRadius: '50%',
            background: 'rgba(160,120,70,0.3)', pointerEvents: 'none',
          }} />

          {/* Pitcher figure */}
          <PitcherFigure faded={pitchActive && pitchProgress > 0.4} />

          {/* ── STRIKE ZONE ── */}
          <div style={{
            position: 'absolute',
            top: `${ZONE_TOP}%`, left: `${ZONE_LEFT}%`,
            width: `${ZONE_RIGHT - ZONE_LEFT}%`, height: `${ZONE_BOTTOM - ZONE_TOP}%`,
            border: `2px ${zoneHighlight ? 'solid' : 'dashed'} ${zoneHighlight ? 'rgba(255,107,53,0.45)' : 'rgba(255,255,255,0.10)'}`,
            borderRadius: 4, pointerEvents: 'none',
            boxShadow: zoneHighlight ? '0 0 16px rgba(255,107,53,0.15), inset 0 0 20px rgba(255,107,53,0.05)' : 'none',
            transition: 'all 250ms ease',
          }}>
            {/* 3x3 grid */}
            <div style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, height: 1, background: zoneHighlight ? 'rgba(255,107,53,0.18)' : 'rgba(255,255,255,0.04)' }} />
            <div style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, height: 1, background: zoneHighlight ? 'rgba(255,107,53,0.18)' : 'rgba(255,255,255,0.04)' }} />
            <div style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, width: 1, background: zoneHighlight ? 'rgba(255,107,53,0.18)' : 'rgba(255,255,255,0.04)' }} />
            <div style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, width: 1, background: zoneHighlight ? 'rgba(255,107,53,0.18)' : 'rgba(255,255,255,0.04)' }} />
          </div>

          {/* ── BALL ── */}
          {pitchActive && ball && (
            <div
              key={pitchIndex}
              style={{
                position: 'absolute',
                left: `${ball.x}%`, top: `${ball.y}%`,
                transform: 'translate(-50%, -50%)',
                width: ball.size, height: ball.size,
                pointerEvents: 'none', zIndex: 5,
              }}
            >
              <div style={{
                width: '100%', height: '100%', borderRadius: '50%',
                background: 'radial-gradient(circle at 38% 35%, #ffffff 0%, #f0f0f0 40%, #d8d8d8 100%)',
                boxShadow: `0 0 ${8 + ball.size * 0.3}px rgba(255,255,255,0.5), 0 ${ball.size * 0.15}px ${ball.size * 0.3}px rgba(0,0,0,0.4)`,
                position: 'relative', overflow: 'hidden',
              }}>
                {/* Seams */}
                <svg style={{ position: 'absolute', inset: 0 }} viewBox="0 0 48 48">
                  <path d="M10 6 Q18 18 10 32" stroke="#cc3333" strokeWidth="1.8" fill="none" opacity="0.6" />
                  <path d="M38 16 Q30 28 38 42" stroke="#cc3333" strokeWidth="1.8" fill="none" opacity="0.6" />
                </svg>
              </div>
            </div>
          )}

          {/* ── SCREEN FLASH on contact ── */}
          {flashColor && (
            <div
              key={`flash-${stats.pitches}`}
              style={{
                position: 'absolute', inset: 0,
                background: `radial-gradient(circle at 50% 80%, ${flashColor}, transparent 70%)`,
                animation: 'hr-screen-flash 0.5s ease-out forwards',
                pointerEvents: 'none', zIndex: 7,
              }}
            />
          )}

          {/* ── BALL EXIT ANIMATION ── */}
          {exitAnim && (
            <BallExit
              key={`exit-${stats.pitches}`}
              type={exitAnim.type}
              startX={exitAnim.startX}
              startY={exitAnim.startY}
              dir={exitAnim.dir}
            />
          )}

          {/* Pitch type indicator */}
          {pitchActive && (
            <div style={{
              position: 'absolute', top: 10, right: 10,
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
              color: currentPitch.color, opacity: 0.6,
              background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 4,
              pointerEvents: 'none',
            }}>
              {currentPitch.type}
            </div>
          )}

          {/* ── RESULT TEXT ── */}
          {resultText && (
            <div
              key={stats.pitches}
              className="derby-result-pop"
              style={{
                position: 'absolute', top: '42%', left: '50%',
                transform: 'translate(-50%, -50%)',
                fontFamily: 'var(--db-font-display)', fontSize: swingResult === 'hr' ? 38 : 26,
                fontWeight: 900, letterSpacing: '0.06em',
                color: resultColor,
                textShadow: swingResult === 'hr' ? '0 0 30px rgba(255,107,53,0.9)' : '0 2px 10px rgba(0,0,0,0.7)',
                zIndex: 10, pointerEvents: 'none', whiteSpace: 'nowrap',
                textAlign: 'center',
              }}
            >
              {resultText}
              {swingResult === 'hr' && <span style={{ display: 'block', fontSize: 20, color: 'var(--db-primary)', marginTop: 2 }}>+10 ◈</span>}
              {swingResult === 'hit' && <span style={{ display: 'block', fontSize: 17, color: 'var(--db-success)', marginTop: 2 }}>+5 ◈</span>}
              {swingResult === 'foul' && <span style={{ display: 'block', fontSize: 14, color: 'var(--db-text-ghost)', marginTop: 2 }}>+1 ◈</span>}
            </div>
          )}

          {/* "TAP TO SWING" hint */}
          {!pitchActive && !resultText && (
            <div style={{
              position: 'absolute', bottom: '4%', left: '50%', transform: 'translateX(-50%)',
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
              color: 'rgba(255,255,255,0.18)', letterSpacing: 'var(--db-tracking-widest)',
              pointerEvents: 'none',
            }}>
              TAP TO SWING
            </div>
          )}
        </div>
      </main>
    )
  }

  // ── End / Submitted screen ──
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
            { label: 'Pitches', value: stats.pitches },
            { label: 'Home Runs', value: stats.homeRuns },
            { label: 'Hits', value: stats.hits },
            { label: 'Fouls', value: stats.fouls },
          ].map(({ label, value }) => (
            <div key={label}>
              <span style={{
                fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
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
          <button type="button" onClick={handleSubmit} style={startButtonStyle}>
            COLLECT {coins} ◈
          </button>
        )}
      </div>
    </main>
  )
}

// ═══════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════

function BallparkSilhouette() {
  return (
    <svg
      style={{ position: 'absolute', top: '12%', left: 0, right: 0, height: '22%', pointerEvents: 'none' }}
      viewBox="0 0 200 50" preserveAspectRatio="none"
    >
      {/* Outfield wall / fence */}
      <path
        d="M0 50 L0 28 Q20 18, 50 14 Q80 10, 100 9 Q120 10, 150 14 Q180 18, 200 28 L200 50 Z"
        fill="rgba(30,60,30,0.6)"
      />
      {/* Fence top edge */}
      <path
        d="M0 28 Q20 18, 50 14 Q80 10, 100 9 Q120 10, 150 14 Q180 18, 200 28"
        stroke="rgba(80,80,80,0.4)" strokeWidth="1.5" fill="none"
      />
      {/* Scoreboard hint center */}
      <rect x="80" y="4" width="40" height="8" rx="1" fill="rgba(40,60,40,0.5)" />
      {/* Light tower left */}
      <rect x="20" y="0" width="2" height="15" fill="rgba(100,100,100,0.25)" />
      <circle cx="21" cy="0" r="2" fill="rgba(255,255,200,0.08)" />
      {/* Light tower right */}
      <rect x="178" y="0" width="2" height="15" fill="rgba(100,100,100,0.25)" />
      <circle cx="179" cy="0" r="2" fill="rgba(255,255,200,0.08)" />
    </svg>
  )
}

function PitcherFigure({ faded = false }) {
  return (
    <div style={{
      position: 'absolute', top: '16%', left: '50%', transform: 'translateX(-50%)',
      opacity: faded ? 0.25 : 0.6,
      transition: 'opacity 200ms',
      pointerEvents: 'none',
    }}>
      {/* Head */}
      <div style={{
        width: 12, height: 12, borderRadius: '50%',
        background: 'rgba(200,180,160,0.4)',
        margin: '0 auto 2px',
      }} />
      {/* Body */}
      <div style={{
        width: 18, height: 24, borderRadius: '4px 4px 2px 2px',
        background: 'rgba(200,200,200,0.2)',
        margin: '0 auto',
      }} />
      {/* Legs */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 1 }}>
        <div style={{ width: 6, height: 14, borderRadius: '0 0 2px 2px', background: 'rgba(200,200,200,0.15)' }} />
        <div style={{ width: 6, height: 14, borderRadius: '0 0 2px 2px', background: 'rgba(200,200,200,0.15)' }} />
      </div>
    </div>
  )
}

function HomePlate({ y }) {
  return (
    <div style={{
      position: 'absolute', top: y, left: '50%', transform: 'translate(-50%, -50%)',
      pointerEvents: 'none',
    }}>
      {/* Plate */}
      <svg width="40" height="28" viewBox="0 0 40 28">
        <polygon points="5,0 35,0 40,10 20,28 0,10" fill="rgba(255,255,255,0.25)" />
        <polygon points="5,0 35,0 40,10 20,28 0,10" stroke="rgba(255,255,255,0.12)" strokeWidth="1" fill="none" />
      </svg>
    </div>
  )
}

function BallExit({ type, startX, startY, dir }) {
  // Physics-style exit: use CSS animation with custom properties
  const animClass = type === 'hr' ? 'derby-exit-hr'
    : type === 'hit' ? 'derby-exit-hit'
      : dir > 0 ? 'derby-exit-foul-r' : 'derby-exit-foul-l'

  const ballSize = type === 'hr' ? 20 : type === 'hit' ? 16 : 14
  const glowColor = type === 'hr' ? 'rgba(255,107,53,0.7)' : type === 'hit' ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.3)'

  return (
    <div
      className={animClass}
      style={{
        position: 'absolute',
        left: `${startX}%`, top: `${startY}%`,
        pointerEvents: 'none', zIndex: 8,
      }}
    >
      <div style={{
        width: ballSize, height: ballSize, borderRadius: '50%', background: '#fff',
        boxShadow: `0 0 ${type === 'hr' ? 24 : 12}px ${glowColor}`,
        transform: 'translate(-50%, -50%)',
      }} />
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
