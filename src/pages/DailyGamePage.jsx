import { useState, useRef, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useDailyActivity } from '../hooks/useDailyActivity.js'
import { hapticLight, hapticMedium, hapticHeavy } from '../lib/haptics.js'
import AdRewardButton from '../components/ui/AdRewardButton.jsx'

const GAME_DURATION = 30 // seconds
const HOOP_Y = 80 // hoop position from top (px in game units)
const HOOP_X = 50 // center (%)

function randomBetween(a, b) { return a + Math.random() * (b - a) }

export default function DailyGamePage() {
  const { user } = useAuth()
  const { activity, reload: reloadActivity } = useDailyActivity()
  const alreadyDone = activity?.game_completed

  const [gameState, setGameState] = useState('ready') // ready | playing | ended | submitted
  const [score, setScore] = useState(0)
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION)
  const [shots, setShots] = useState([]) // { id, x, made, animating }
  const [finalDobs, setFinalDobs] = useState(0)
  const [doubled, setDoubled] = useState(false)
  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [scoreFlash, setScoreFlash] = useState(false)
  const [rimGlow, setRimGlow] = useState(false)
  const timerRef = useRef(null)
  const shotIdRef = useRef(0)

  // If already done, show results
  if (alreadyDone && gameState === 'ready') {
    return (
      <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <Link to="/" className="back-btn" aria-label="Back to home">← Back</Link>
          <h1 style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
            fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
            color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)',
            margin: '8px 0 16px',
          }}>STREAK SHOT</h1>
        </div>
        <div style={{
          margin: '0 20px', padding: '40px 24px', borderRadius: 14, textAlign: 'center',
          background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
        }}>
          <span style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
            color: 'var(--db-success)',
          }}>COMPLETED TODAY</span>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
            color: 'var(--db-text-muted)', display: 'block', marginTop: 8,
          }}>
            Earned {activity.game_dobs_earned} ◈ · Come back tomorrow!
          </span>
        </div>
      </main>
    )
  }

  const startGame = () => {
    setGameState('playing')
    setScore(0)
    setTimeLeft(GAME_DURATION)
    setShots([])

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
  }

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  const shoot = useCallback(() => {
    if (gameState !== 'playing') return

    // ~55% make rate
    const made = Math.random() < 0.55
    const shotX = randomBetween(30, 70)
    const id = ++shotIdRef.current

    if (made) {
      hapticMedium()
      setScore((s) => s + 1)
      setStreak((s) => {
        const next = s + 1
        setBestStreak((b) => Math.max(b, next))
        return next
      })
      // Visual feedback
      setScoreFlash(true)
      setRimGlow(true)
      setTimeout(() => setScoreFlash(false), 350)
      setTimeout(() => setRimGlow(false), 500)
    } else {
      hapticLight()
      setStreak(0)
    }

    setShots((prev) => [...prev.slice(-8), { id, x: shotX, made, animating: true }])

    setTimeout(() => {
      setShots((prev) => prev.filter((s) => s.id !== id))
    }, 1200)
  }, [gameState])

  const handleSubmit = async () => {
    if (!user) return
    const dobs = doubled ? score * 2 : score
    setFinalDobs(dobs)
    setGameState('submitted')

    await supabase.rpc('complete_daily_activity', {
      p_user_id: user.id,
      p_activity: 'game',
      p_dobs_earned: dobs,
      p_game_type: 'streak_shot',
    })

    reloadActivity()
  }

  const handleAdReward = () => {
    hapticHeavy()
    setDoubled(true)
  }

  // ── Ready screen ──
  if (gameState === 'ready') {
    return (
      <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        <div style={{ padding: '20px 20px 0' }}>
          <Link to="/" className="back-btn" aria-label="Back to home">← Back</Link>
          <h1 style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
            fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
            color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)',
            margin: '8px 0 4px',
          }}>STREAK SHOT</h1>
          <p style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
            color: 'var(--db-text-muted)', margin: '0 0 24px',
          }}>
            Tap to shoot! 1 ◈ per basket. {GAME_DURATION} seconds on the clock.
          </p>
        </div>

        {/* Court preview */}
        <div style={{
          margin: '0 20px', borderRadius: 14, overflow: 'hidden',
          background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
          height: 260, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* Hoop */}
          <div style={{ position: 'absolute', top: HOOP_Y, left: '50%', transform: 'translateX(-50%)' }}>
            <Hoop />
          </div>

          {/* Basketball */}
          <div style={{ position: 'absolute', bottom: 40, left: '50%', transform: 'translateX(-50%)' }}>
            <Basketball size={36} />
          </div>
        </div>

        <div style={{ padding: '20px' }}>
          <button
            type="button"
            onClick={startGame}
            style={{
              width: '100%', padding: '18px', borderRadius: 10, border: 'none',
              background: 'var(--db-gradient-primary)', color: '#fff',
              fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
              fontWeight: 'var(--db-weight-extrabold)', letterSpacing: 'var(--db-tracking-wide)',
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,107,53,0.3)',
            }}
          >
            START SHOOTING
          </button>
        </div>
      </main>
    )
  }

  // ── Playing screen ──
  if (gameState === 'playing') {
    return (
      <main style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
        {/* HUD */}
        <div style={{
          padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              key={scoreFlash ? `s-${score}` : 's'}
              className={scoreFlash ? 'score-flash' : ''}
              style={{
                fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-2xl)',
                color: 'var(--db-primary)', lineHeight: 1,
                fontVariantNumeric: 'tabular-nums',
              }}
            >{score}</span>
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
              color: 'var(--db-text-muted)',
            }}>◈</span>
            {streak >= 3 && (
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
                fontWeight: 'var(--db-weight-bold)', color: 'var(--db-success)',
                background: 'rgba(34,197,94,0.12)', padding: '2px 6px', borderRadius: 4,
              }}>
                {streak}x STREAK
              </span>
            )}
          </div>
          <div style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xl)',
            fontWeight: 'var(--db-weight-bold)',
            color: timeLeft <= 5 ? 'var(--db-live)' : 'var(--db-text-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {timeLeft}s
          </div>
        </div>

        {/* Court — tap to shoot */}
        <div
          onClick={shoot}
          role="button"
          aria-label={`Shoot basketball. Score: ${score}. Time: ${timeLeft} seconds`}
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shoot() } }}
          style={{
            margin: '0 20px', borderRadius: 14, overflow: 'hidden',
            background: 'linear-gradient(180deg, #0f1528 0%, #162040 50%, #1a2848 100%)',
            border: '1px solid var(--db-border-subtle)',
            height: 360, position: 'relative', cursor: 'pointer',
            userSelect: 'none', WebkitUserSelect: 'none',
            touchAction: 'manipulation',
          }}
        >
          {/* Court floor grain */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'repeating-linear-gradient(90deg, transparent, transparent 8px, rgba(255,255,255,0.015) 8px, rgba(255,255,255,0.015) 9px)',
            pointerEvents: 'none',
          }} />

          {/* Three-point arc */}
          <div style={{
            position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
            width: '80%', height: '55%', border: '1px solid rgba(255,255,255,0.06)',
            borderBottom: 'none', borderRadius: '50% 50% 0 0',
          }} />

          {/* Free throw line */}
          <div style={{
            position: 'absolute', bottom: '35%', left: '25%', right: '25%',
            height: 1, background: 'rgba(255,255,255,0.06)',
          }} />

          {/* Lane / key */}
          <div style={{
            position: 'absolute', bottom: 0, left: '35%', right: '35%',
            height: '35%', border: '1px solid rgba(255,255,255,0.05)',
            borderBottom: 'none',
          }} />

          {/* Hoop */}
          <div style={{ position: 'absolute', top: HOOP_Y, left: '50%', transform: 'translateX(-50%)' }}>
            <Hoop glowing={rimGlow} />
          </div>

          {/* Shot animations */}
          {shots.map((shot) => (
            <div
              key={shot.id}
              style={{
                position: 'absolute',
                left: `${shot.x}%`,
                bottom: 40,
                transform: 'translateX(-50%)',
                animation: shot.made
                  ? 'shot-arc-make 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards'
                  : 'shot-arc-miss 0.8s cubic-bezier(0.25, 1, 0.5, 1) forwards',
              }}
            >
              <Basketball size={28} />
            </div>
          ))}

          {/* Score popup */}
          {shots.filter(s => s.made).slice(-1).map((shot) => (
            <div
              key={`score-${shot.id}`}
              style={{
                position: 'absolute', top: HOOP_Y - 10, left: '50%',
                transform: 'translateX(-50%)',
                fontFamily: 'var(--db-font-display)', fontSize: 24,
                color: 'var(--db-primary)', fontWeight: 900,
                animation: 'score-pop 0.6s ease-out forwards',
                pointerEvents: 'none',
              }}
            >
              +1
            </div>
          ))}

          {/* Tap instruction */}
          <div style={{
            position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)',
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)',
            color: 'rgba(255,255,255,0.3)', letterSpacing: 'var(--db-tracking-widest)',
          }}>
            TAP TO SHOOT
          </div>
        </div>
      </main>
    )
  }

  // ── End / Submitted screen ──
  return (
    <main className="page-enter" style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ padding: '20px 20px 0' }}>
        <h1 style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
          fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
          color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)',
          margin: '0 0 4px',
        }}>GAME OVER</h1>
      </div>

      {/* Score card */}
      <div className="celebrate-pop" style={{
        margin: '16px 20px 0', padding: '32px 24px', borderRadius: 14, textAlign: 'center',
        background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
      }}>
        <span style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
          letterSpacing: 'var(--db-tracking-widest)', color: 'var(--db-text-muted)',
          display: 'block', marginBottom: 8,
        }}>BASKETS MADE</span>
        <span style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-4xl)',
          color: 'var(--db-primary)', display: 'block', lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {score}
        </span>
        {bestStreak >= 3 && (
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
            color: 'var(--db-success)', display: 'block', marginTop: 8,
          }}>
            Best streak: {bestStreak} in a row
          </span>
        )}
        <span style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
          color: doubled ? 'var(--db-success)' : 'var(--db-text-secondary)',
          display: 'block', marginTop: 12,
          fontVariantNumeric: 'tabular-nums',
        }}>
          {doubled ? `${score * 2} ◈ (2x!)` : `${score} ◈`}
        </span>
      </div>

      {/* Ad reward button */}
      {gameState === 'ended' && !doubled && (
        <div style={{ padding: '16px 20px 0' }}>
          <AdRewardButton
            onReward={handleAdReward}
            label="Watch Ad to Double"
          />
        </div>
      )}

      {/* Collect button */}
      <div style={{ padding: '16px 20px 0' }}>
        {gameState === 'submitted' ? (
          <Link to="/" style={{
            display: 'block', padding: '16px', borderRadius: 10, textAlign: 'center',
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)',
            textDecoration: 'none',
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
            letterSpacing: 'var(--db-tracking-wide)', color: 'var(--db-success)',
          }}>
            ✓ {finalDobs} ◈ EARNED · BACK TO HOME
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleSubmit}
            style={{
              width: '100%', padding: '16px', borderRadius: 10, border: 'none',
              background: 'var(--db-gradient-primary)', color: '#fff',
              fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)',
              fontWeight: 'var(--db-weight-extrabold)', letterSpacing: 'var(--db-tracking-wide)',
              cursor: 'pointer', boxShadow: '0 4px 16px rgba(255,107,53,0.3)',
            }}
          >
            COLLECT {doubled ? score * 2 : score} ◈
          </button>
        )}
      </div>
    </main>
  )
}

// ── Sub-components ──

function Basketball({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="#e87c3f" stroke="#c45e2a" strokeWidth="1.5" />
      <path d="M2 16 h28 M16 2 v28" stroke="#c45e2a" strokeWidth="0.8" opacity="0.6" />
      <path d="M5 5 Q16 16 5 27 M27 5 Q16 16 27 27" stroke="#c45e2a" strokeWidth="0.8" fill="none" opacity="0.4" />
    </svg>
  )
}

function Hoop({ glowing = false }) {
  return (
    <div style={{ position: 'relative', width: 60, height: 50 }}>
      {/* Backboard */}
      <div style={{
        position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
        width: 48, height: 32, border: '2px solid rgba(255,255,255,0.3)',
        borderRadius: 2, background: 'rgba(255,255,255,0.05)',
      }} />
      {/* Rim */}
      <div
        key={glowing ? 'glow' : 'no'}
        className={glowing ? 'rim-glow' : ''}
        style={{
          position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)',
          width: 36, height: 4, borderRadius: 2,
          background: '#ff4444', boxShadow: '0 2px 8px rgba(255,68,68,0.4)',
        }}
      />
      {/* Net lines */}
      <div style={{
        position: 'absolute', top: 32, left: '50%', transform: 'translateX(-50%)',
        width: 28, height: 16, borderLeft: '1px solid rgba(255,255,255,0.15)',
        borderRight: '1px solid rgba(255,255,255,0.15)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '0 0 8px 8px',
      }} />
    </div>
  )
}
