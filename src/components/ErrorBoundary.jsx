import { Component } from 'react'
import { Sentry } from '../lib/sentry.js'

const CHUNK_RELOAD_KEY = 'dobber-chunk-reload'

function isChunkError(error) {
  const msg = error?.message ?? ''
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes("'text/html' is not a valid JavaScript MIME type") ||
    msg.includes('Loading chunk') ||
    msg.includes('Loading CSS chunk')
  )
}

function FallbackUI() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--db-bg-page)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ background: 'var(--db-bg-surface)', border: '1px solid rgba(255,45,45,0.2)', borderRadius: 12, padding: 32, maxWidth: 360, width: '100%' }}>
        <h1 style={{ fontFamily: 'var(--db-font-display)', fontSize: 20, letterSpacing: '0.04em', color: 'var(--db-text-primary)' }}>
          SOMETHING WENT WRONG
        </h1>
        <p style={{ marginTop: 8, fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)' }}>
          An unexpected error occurred.
        </p>
        <button
          type="button"
          onClick={() => { window.location.href = '/' }}
          style={{
            marginTop: 20, width: '100%',
            background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 20px', fontFamily: 'var(--db-font-display)', fontSize: 13,
            letterSpacing: '0.06em', cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(255,107,53,0.3)',
            transition: 'opacity 100ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          BACK TO LOBBY
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, width: '100%',
            background: 'var(--db-bg-elevated)', color: 'var(--db-text-muted)', border: '1px solid var(--db-border-default)', borderRadius: 8,
            padding: '8px 20px', fontFamily: 'var(--db-font-ui)', fontSize: 12,
            fontWeight: 500, cursor: 'pointer',
            transition: 'background 100ms ease, color 100ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
        >
          Refresh page
        </button>
        <p style={{ marginTop: 16, fontFamily: 'var(--db-font-ui)', fontSize: 10, color: 'var(--db-text-ghost)' }}>
          Dobber v0.1
        </p>
      </div>
    </div>
  )
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error) {
    // Chunk errors: don't set hasError — we'll reload in componentDidCatch
    if (isChunkError(error)) return {}
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    if (isChunkError(error)) {
      const last = sessionStorage.getItem(CHUNK_RELOAD_KEY)
      const now = Date.now()
      if (!last || now - Number(last) > 10_000) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, String(now))
        window.location.reload()
        return
      }
      // Reloaded recently and still failing — show error UI rather than infinite loop
      this.setState({ hasError: true })
      return
    }
    // Non-chunk errors: capture in Sentry
    Sentry.captureException?.(error, { extra: info })
  }

  render() {
    if (this.state.hasError) return <FallbackUI />
    return this.props.children
  }
}

export default ErrorBoundary
