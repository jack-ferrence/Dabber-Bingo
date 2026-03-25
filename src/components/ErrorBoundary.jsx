import { Sentry } from '../lib/sentry.js'

function FallbackUI() {
  return (
    <div style={{ minHeight: '100vh', background: '#0c0c14', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center' }}>
      <div style={{ background: '#12121e', border: '1px solid rgba(255,45,45,0.25)', borderRadius: 8, padding: 32 }}>
        <h1 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 700, color: '#e0e0f0', letterSpacing: '0.04em' }}>
          Something went wrong
        </h1>
        <p style={{ marginTop: 8, fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>
          An unexpected error occurred.
        </p>
        <button
          type="button"
          onClick={() => { window.location.href = '/' }}
          style={{
            marginTop: 20, width: '100%',
            background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 4,
            padding: '8px 20px', fontFamily: 'var(--db-font-mono)', fontSize: 11,
            fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            transition: 'background 100ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = '#ff8855' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = '#ff6b35' }}
        >
          Back to Lobby
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          style={{
            marginTop: 8, width: '100%',
            background: 'none', color: '#555577', border: '1px solid #2a2a44', borderRadius: 4,
            padding: '8px 20px', fontFamily: 'var(--db-font-mono)', fontSize: 11,
            fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer',
            transition: 'color 100ms ease, border-color 100ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#8888aa'; e.currentTarget.style.borderColor = '#3a3a55' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#555577'; e.currentTarget.style.borderColor = '#2a2a44' }}
        >
          Refresh Page
        </button>
        <p style={{ marginTop: 16, fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#3a3a55' }}>
          Dobber v0.1
        </p>
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
