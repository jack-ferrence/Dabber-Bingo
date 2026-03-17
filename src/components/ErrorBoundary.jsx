import { Sentry } from '../lib/sentry.js'

function FallbackUI() {
  return (
    <div style={{ minHeight: '100vh', background: '#0c0c14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ background: '#12121e', border: '1px solid rgba(255,45,45,0.25)', borderRadius: 8, padding: 32 }}>
        <h1 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 700, color: '#e0e0f0', letterSpacing: '0.04em' }}>
          Something went wrong
        </h1>
        <p style={{ marginTop: 8, fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>
          An unexpected error occurred. Refresh to rejoin your game.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{ marginTop: 20, background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 4, padding: '8px 20px', fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#ff8855' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#ff6b35' }}
        >
          Refresh Page
        </button>
      </div>
    </div>
  )
}

function ErrorBoundary({ children }) {
  if (Sentry.ErrorBoundary) {
    return (
      <Sentry.ErrorBoundary fallback={<FallbackUI />}>
        {children}
      </Sentry.ErrorBoundary>
    )
  }

  return children
}

export default ErrorBoundary
