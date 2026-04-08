import { useState, useEffect } from 'react'

export default function SplashScreen({ onFinished }) {
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setFadeOut(true), 2100)
    const t2 = setTimeout(() => onFinished?.(), 2500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onFinished])

  return (
    <>
      <style>{`
        @keyframes splash-roll {
          0%   { opacity: 0; transform: translateX(-300px) rotate(0deg); }
          10%  { opacity: 1; }
          70%  { transform: translateX(12px) rotate(740deg); }
          85%  { transform: translateX(-4px) rotate(715deg); }
          100% { transform: translateX(0) rotate(720deg); }
        }
        @keyframes splash-shadow-in {
          0%   { opacity: 0; transform: scaleX(0.3); }
          70%  { opacity: 0.15; transform: scaleX(1.1); }
          100% { opacity: 0.08; transform: scaleX(1); }
        }
        @keyframes splash-title-pop {
          0%   { opacity: 0; transform: scale(0.5); }
          60%  { transform: scale(1.04); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes splash-tagline-in {
          0%   { opacity: 0; }
          100% { opacity: 0.5; }
        }
      `}</style>

      <div
        style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          background: 'var(--db-primary)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          opacity: fadeOut ? 0 : 1,
          transition: 'opacity 400ms ease-out',
        }}
      >
        {/* Rolling bingo ball */}
        <div style={{
          width: 100, height: 100,
          animation: 'splash-roll 900ms cubic-bezier(0.22, 0.68, 0.35, 1.2) 200ms both',
        }}>
          <svg viewBox="0 0 512 512" width="100" height="100">
            <defs>
              <linearGradient id="sb" x1="0.3" y1="0.1" x2="0.7" y2="0.9">
                <stop offset="0%" stopColor="#f2efe9"/>
                <stop offset="100%" stopColor="#c8c5bf"/>
              </linearGradient>
              <linearGradient id="sr" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffaa44"/>
                <stop offset="50%" stopColor="var(--db-primary)"/>
                <stop offset="100%" stopColor="#b8400e"/>
              </linearGradient>
            </defs>
            <circle cx="275" cy="275" r="220" fill="rgba(12,12,20,0.12)"/>
            <circle cx="256" cy="256" r="220" fill="url(#sb)"/>
            <circle cx="256" cy="256" r="130" fill="none" stroke="url(#sr)" strokeWidth="22"/>
            <text x="256" y="256" textAnchor="middle" fontFamily="'Bebas Neue','Oswald',sans-serif" fontSize="165" fontWeight="400" fill="#1a1a2e" dominantBaseline="central">D</text>
          </svg>
        </div>

        {/* Shadow beneath ball */}
        <div style={{
          width: 80, height: 8, borderRadius: '50%',
          background: 'rgba(12,12,20,0.08)', marginTop: 10,
          animation: 'splash-shadow-in 900ms ease-out 200ms both',
        }} />

        {/* Wordmark */}
        <span style={{
          fontFamily: "'Bebas Neue', 'Oswald', sans-serif",
          fontSize: 42, fontWeight: 400, color: '#fff', marginTop: 24,
          letterSpacing: '0.12em',
          animation: 'splash-title-pop 400ms cubic-bezier(0.34, 1.56, 0.64, 1) 1100ms both',
        }}>DOBBER</span>

        {/* Tagline */}
        <span style={{
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 11, color: 'rgba(255,255,255,0.5)',
          marginTop: 4, letterSpacing: '0.08em',
          animation: 'splash-tagline-in 300ms ease-out 1500ms both',
        }}>FREE SPORTS BINGO</span>
      </div>
    </>
  )
}
