import { useState, useEffect } from 'react'

export default function SplashScreen({ onFinished }) {
  const [fadeOut, setFadeOut] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setFadeOut(true), 1200)
    const remove = setTimeout(() => onFinished?.(), 1600)
    return () => { clearTimeout(timer); clearTimeout(remove) }
  }, [onFinished])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: '#0c0c14',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      opacity: fadeOut ? 0 : 1,
      transition: 'opacity 400ms ease-out',
    }}>
      {/* Logo */}
      <div style={{
        width: 72, height: 72, borderRadius: 16,
        background: '#ff6b35',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 40px rgba(255,107,53,0.3)',
        animation: 'splash-logo-in 600ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
      }}>
        {/* 5 diagonal dots */}
        <svg width="36" height="36" viewBox="0 0 36 36">
          <circle cx="6"  cy="6"  r="3" fill="#0c0c14" />
          <circle cx="13" cy="13" r="3" fill="#0c0c14" />
          <circle cx="20" cy="20" r="3" fill="#0c0c14" />
          <circle cx="27" cy="27" r="3" fill="#0c0c14" />
          <circle cx="34" cy="34" r="3" fill="#0c0c14" />
        </svg>
      </div>

      {/* Wordmark */}
      <span style={{
        fontFamily: 'var(--db-font-display)', fontSize: 28, letterSpacing: '0.2em',
        color: '#e8e8f4', marginTop: 16,
        animation: 'splash-text-in 500ms ease-out 200ms both',
      }}>
        DOBBER
      </span>

      {/* Tagline */}
      <span style={{
        fontFamily: 'var(--db-font-mono)', fontSize: 11,
        color: 'rgba(255,255,255,0.3)', marginTop: 6,
        animation: 'splash-text-in 500ms ease-out 400ms both',
      }}>
        Free sports bingo
      </span>
    </div>
  )
}
