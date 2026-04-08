import { useEffect, useState } from 'react'

let deferredPrompt = null

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    deferredPrompt = e
  })
}

export default function InstallPrompt() {
  const [show, setShow] = useState(false)
  const [isIos, setIsIos] = useState(false)

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) return
    if (window.navigator.standalone === true) return

    const dismissed = localStorage.getItem('pwa-install-dismissed')
    if (dismissed && Date.now() - Number(dismissed) < 7 * 24 * 60 * 60 * 1000) return

    const ua = navigator.userAgent
    const isiOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream
    setIsIos(isiOS)

    const timer = setTimeout(() => {
      if (deferredPrompt || isiOS) setShow(true)
    }, 30000)

    return () => clearTimeout(timer)
  }, [])

  const handleInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt()
      const { outcome } = await deferredPrompt.userChoice
      if (outcome === 'accepted') setShow(false)
      deferredPrompt = null
    }
  }

  const handleDismiss = () => {
    localStorage.setItem('pwa-install-dismissed', String(Date.now()))
    setShow(false)
  }

  if (!show) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 70,
      left: 12,
      right: 12,
      zIndex: 60,
      background: 'var(--db-bg-surface)',
      border: '1px solid var(--db-border-default)',
      borderRadius: 12,
      padding: '14px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      animation: 'slideUp 0.3s ease-out',
    }}>
      <img src="/icon-192.png" alt="Dobber" width={40} height={40} style={{ borderRadius: 8, flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--db-text-primary)', margin: '0 0 2px' }}>
          ADD DOBBER TO HOME SCREEN
        </p>
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 400, color: 'var(--db-text-ghost)', margin: 0 }}>
          {isIos ? 'Tap Share ↑ then "Add to Home Screen"' : 'Install for the full app experience'}
        </p>
      </div>

      {!isIos && (
        <button
          type="button"
          onClick={handleInstall}
          style={{ background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.06em', padding: '7px 14px', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}
        >
          INSTALL
        </button>
      )}

      <button
        type="button"
        onClick={handleDismiss}
        style={{ background: 'none', border: 'none', color: 'var(--db-text-muted)', fontSize: 16, cursor: 'pointer', padding: '4px', flexShrink: 0, lineHeight: 1, transition: 'color 120ms ease' }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-secondary)' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-ghost)' }}
      >
        ✕
      </button>
    </div>
  )
}
