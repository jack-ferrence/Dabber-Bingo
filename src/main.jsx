// ── Stale chunk auto-recovery ─────────────────────────────────────────────
// After deploys, old Vite chunk filenames no longer exist on the CDN.
// Reload once silently — sessionStorage guard prevents infinite reload loops.
const CHUNK_RELOAD_KEY = 'dobber-chunk-reload'
window.addEventListener('error', (e) => {
  const isChunk = (
    e.message?.includes('Failed to fetch dynamically imported module') ||
    e.message?.includes('Importing a module script failed') ||
    e.message?.includes("'text/html' is not a valid JavaScript MIME type") ||
    e.message?.includes('Loading chunk') ||
    e.message?.includes('Loading CSS chunk')
  )
  if (!isChunk) return
  const last = sessionStorage.getItem(CHUNK_RELOAD_KEY)
  const now = Date.now()
  if (last && now - Number(last) < 10_000) {
    console.warn('Stale chunk: already reloaded recently, not retrying')
    return
  }
  sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
  console.warn('Stale chunk detected — reloading...')
  window.location.reload()
})

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './lib/sentry.js'
import './index.css'
import App from './App.jsx'
import { AuthProvider } from './hooks/useAuth.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'

// Apply saved theme immediately to prevent flash of wrong theme
;(function () {
  try {
    const saved = localStorage.getItem('dobber-theme') || 'dark'
    document.documentElement.setAttribute('data-theme', saved)
    const resolved = saved === 'system'
      ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
      : saved
    document.body.style.background = resolved === 'light' ? '#f5f5f0' : '#0c0c14'
  } catch {}
})()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
