import { useState, useEffect } from 'react'

export default function SplashScreen({ onFinished }) {
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFadeOut(true), 2800)
    const t2 = setTimeout(() => onFinished?.(), 3200)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onFinished])

  return (
    <div
      className="splash-root"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#ff6b35',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        opacity: fadeOut ? 0 : 1,
        transition: 'opacity 400ms ease-out',
      }}
    >
      {/* Rolling bingo ball */}
      <div className="splash-ball" style={{ width: 120, height: 120 }}>
        <svg viewBox="0 0 512 512" width="120" height="120">
          <defs>
            <linearGradient id="sb" x1="0.3" y1="0.1" x2="0.7" y2="0.9">
              <stop offset="0%" stopColor="#f2efe9"/>
              <stop offset="100%" stopColor="#c8c5bf"/>
            </linearGradient>
            <linearGradient id="sr" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ff8a55"/>
              <stop offset="100%" stopColor="#e05525"/>
            </linearGradient>
          </defs>
          <circle cx="275" cy="275" r="220" fill="rgba(12,12,20,0.12)"/>
          <circle cx="256" cy="256" r="220" fill="url(#sb)"/>
          <circle cx="256" cy="256" r="130" fill="none" stroke="url(#sr)" strokeWidth="22"/>
          <text x="256" y="256" textAnchor="middle" fontFamily="'Bebas Neue',Impact,sans-serif" fontSize="165" fontWeight="700" fill="#1a1a2e" dominantBaseline="central">D</text>
        </svg>
      </div>

      {/* Shadow beneath ball */}
      <div className="splash-shadow" style={{
        width: 90, height: 10, borderRadius: '50%',
        background: 'rgba(12,12,20,0.08)', marginTop: 10,
      }} />

      {/* Wordmark */}
      <span className="splash-wordmark" style={{
        fontFamily: "'Bebas Neue', Impact, sans-serif",
        fontSize: 42, color: '#fff', marginTop: 24,
        letterSpacing: '0.18em',
      }}>DOBBER</span>

      {/* Tagline */}
      <span className="splash-tagline" style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, color: 'rgba(255,255,255,0.5)',
        marginTop: 4, letterSpacing: '0.08em',
      }}>FREE SPORTS BINGO</span>
    </div>
  )
}
