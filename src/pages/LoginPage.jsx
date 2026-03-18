import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DobberLogo from '../components/ui/DobberLogo.jsx'

const inputStyle = {
  width: '100%',
  background: '#0c0c14',
  border: '1px solid #2a2a44',
  borderRadius: 4,
  padding: '8px 12px',
  fontFamily: 'var(--db-font-mono)',
  fontSize: 13,
  color: '#e0e0f0',
  outline: 'none',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  marginBottom: 6,
  fontFamily: 'var(--db-font-mono)',
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: '#555577',
}

function LoginPage() {
  const [email, setEmail] = useState('')
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

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message)
      setLoading(false)
      return
    }

    navigate(from, { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0c0c14', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: 380 }}>

        {/* Logo lockup */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 32 }}>
          <DobberLogo size={64} />
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 28, fontWeight: 900, letterSpacing: '6px', color: '#e0e0f0' }}>
            DOBBER
          </span>
        </div>

        {/* Card */}
        <div style={{ background: '#12121e', border: '1px solid #1a1a2e', borderRadius: 8, padding: 32 }}>
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 18, fontWeight: 700, color: '#e0e0f0', marginBottom: 4, letterSpacing: '0.04em' }}>
            WELCOME BACK
          </p>
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577', marginBottom: 28 }}>
            Log in to join a room and start playing.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label htmlFor="email" style={labelStyle}>Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.border = '1px solid #ff6b35'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255,107,53,0.12)' }}
                onBlur={(e) => { e.currentTarget.style.border = '1px solid #2a2a44'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label htmlFor="password" style={labelStyle}>Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={inputStyle}
                onFocus={(e) => { e.currentTarget.style.border = '1px solid #ff6b35'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(255,107,53,0.12)' }}
                onBlur={(e) => { e.currentTarget.style.border = '1px solid #2a2a44'; e.currentTarget.style.boxShadow = 'none' }}
              />
            </div>

            {error && (
              <p role="alert" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#ff2d2d', marginBottom: 16 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%',
                background: loading ? '#2a2a44' : '#ff6b35',
                color: loading ? '#555577' : '#0c0c14',
                border: 'none',
                borderRadius: 4,
                padding: '10px 0',
                fontFamily: 'var(--db-font-mono)',
                fontSize: 12,
                fontWeight: 800,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 100ms ease',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = '#ff8855' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.background = '#ff6b35' }}
            >
              {loading ? 'LOGGING IN...' : 'LOG IN'}
            </button>
          </form>

          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', marginTop: 20 }}>
            No account?{' '}
            <Link
              to="/register"
              style={{ color: '#ff6b35', textDecoration: 'none' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff8855' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#ff6b35' }}
            >
              Sign up →
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}

export default LoginPage
