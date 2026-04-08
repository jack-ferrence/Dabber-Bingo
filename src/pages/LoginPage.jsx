import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DobberLogo from '../components/ui/DobberLogo.jsx'

function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const from = location.state?.from?.pathname || '/'

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const trimmed = identifier.trim()
    let email = trimmed

    if (!trimmed.includes('@')) {
      const { data: lookedUp, error: rpcError } = await supabase.rpc('get_email_by_username', {
        p_username: trimmed,
      })
      if (rpcError || !lookedUp) {
        setError('No account found for that username.')
        setLoading(false)
        return
      }
      email = lookedUp
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--db-bg-page)', display: 'flex', position: 'relative', overflow: 'hidden', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

      {/* Background radial glow */}
      <div style={{
        position: 'absolute', top: '-10%', right: '-5%',
        width: 600, height: 600,
        background: 'radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: '-15%', left: '-10%',
        width: 500, height: 500,
        background: 'radial-gradient(circle, rgba(100,80,255,0.04) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      {/* Left brand panel — hidden on mobile */}
      <div className="hidden lg:flex" style={{
        width: 420, flexShrink: 0,
        flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start',
        padding: '0 56px',
        borderRight: '1px solid var(--db-border-subtle)',
        position: 'relative',
      }}>
        <div style={{ marginBottom: 48 }}>
          <DobberLogo size={52} />
        </div>
        <div style={{
          fontFamily: 'var(--db-font-display)',
          fontSize: 72,
          letterSpacing: '0.04em',
          color: 'var(--db-text-primary)',
          lineHeight: 0.92,
          marginBottom: 20,
        }}>
          LIVE<br />
          <span style={{ color: '#ff6b35' }}>SPORTS</span><br />
          BINGO
        </div>
        <p style={{
          fontFamily: 'var(--db-font-ui)', fontSize: 14, fontWeight: 400,
          color: 'var(--db-text-ghost)', lineHeight: 1.6, maxWidth: 280,
        }}>
          Real NBA & MLB props. Live stats. Free to play. One card per game.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 40 }}>
          {['Free to play every day', 'Live real-time scoring', 'Win Dobs, win prizes'].map((f) => (
            <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ff6b35', flexShrink: 0 }} />
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--db-text-muted)' }}>
                {f}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right: form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Mobile logo */}
          <div className="flex lg:hidden" style={{ flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
            <DobberLogo size={44} />
            <span style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 32,
              letterSpacing: '6px',
              color: 'var(--db-text-primary)',
              marginTop: 10,
              lineHeight: 1,
            }}>
              DOBBER
            </span>
          </div>

          {/* Heading */}
          <div style={{ marginBottom: 28 }}>
            <h1 style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 32,
              letterSpacing: '0.06em',
              color: 'var(--db-text-primary)',
              lineHeight: 1,
              margin: '0 0 8px',
            }}>
              WELCOME BACK
            </h1>
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-ghost)', margin: 0 }}>
              Log in to your Dobber account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label
                htmlFor="identifier"
                style={{ display: 'block', marginBottom: 6, fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--db-text-ghost)' }}
              >
                Username or Email
              </label>
              <input
                id="identifier"
                type="text"
                autoComplete="username"
                required
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="username or you@example.com"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 8,
                  background: 'var(--db-border-subtle)',
                  border: '1px solid var(--db-border-default)',
                  fontFamily: 'var(--db-font-ui)', fontSize: 14, fontWeight: 400,
                  color: 'var(--db-text-primary)', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 140ms ease, background 140ms ease',
                }}
                onFocus={(e) => { e.currentTarget.style.border = '1px solid rgba(255,107,53,0.5)'; e.currentTarget.style.background = 'var(--db-border-default)' }}
                onBlur={(e) => { e.currentTarget.style.border = '1px solid var(--db-border-default)'; e.currentTarget.style.background = 'var(--db-border-subtle)' }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                style={{ display: 'block', marginBottom: 6, fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--db-text-ghost)' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 8,
                  background: 'var(--db-border-subtle)',
                  border: '1px solid var(--db-border-default)',
                  fontFamily: 'var(--db-font-ui)', fontSize: 14, fontWeight: 400,
                  color: 'var(--db-text-primary)', outline: 'none', boxSizing: 'border-box',
                  transition: 'border-color 140ms ease, background 140ms ease',
                }}
                onFocus={(e) => { e.currentTarget.style.border = '1px solid rgba(255,107,53,0.5)'; e.currentTarget.style.background = 'var(--db-border-default)' }}
                onBlur={(e) => { e.currentTarget.style.border = '1px solid var(--db-border-default)'; e.currentTarget.style.background = 'var(--db-border-subtle)' }}
              />
            </div>

            {error && (
              <p role="alert" style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: '#ff5555', margin: 0, padding: '8px 12px', background: 'rgba(255,45,45,0.08)', borderRadius: 6, border: '1px solid rgba(255,45,45,0.15)' }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '14px 0', borderRadius: 8, border: 'none',
                background: loading ? 'var(--db-border-default)' : 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                color: loading ? 'var(--db-text-ghost)' : 'var(--db-text-on-primary)',
                fontFamily: 'var(--db-font-display)', fontSize: 16, letterSpacing: '0.1em',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 16px rgba(255,107,53,0.35)',
                transition: 'opacity 120ms ease, box-shadow 120ms ease',
                marginTop: 4,
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1' }}
            >
              {loading ? 'SIGNING IN…' : 'SIGN IN'}
            </button>
          </form>

          <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-ghost)', marginTop: 24, textAlign: 'center' }}>
            Don't have an account?{' '}
            <Link
              to="/register"
              style={{ color: '#ff6b35', textDecoration: 'none', fontWeight: 600, transition: 'color 120ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff8855' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#ff6b35' }}
            >
              Register →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
