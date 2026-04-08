import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import DobberLogo from '../components/ui/DobberLogo.jsx'

const fieldStyle = {
  width: '100%', padding: '11px 14px', borderRadius: 8,
  background: 'var(--db-border-subtle)',
  border: '1px solid var(--db-border-default)',
  fontFamily: 'var(--db-font-ui)', fontSize: 14, fontWeight: 400,
  color: 'var(--db-text-primary)', outline: 'none', boxSizing: 'border-box',
  transition: 'border-color 140ms ease, background 140ms ease',
}

const labelStyle = {
  display: 'block', marginBottom: 6,
  fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600,
  letterSpacing: '0.06em', textTransform: 'uppercase',
  color: 'var(--db-text-ghost)',
}

function RegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const navigate = useNavigate()

  const USERNAME_RE = /^[a-zA-Z0-9_]{3,20}$/

  const validateUsername = (val) => {
    if (!USERNAME_RE.test(val)) return '3–20 characters, letters/numbers/underscores only'
    return ''
  }

  const handleUsernameChange = (e) => {
    const val = e.target.value
    setUsername(val)
    if (val) setUsernameError(validateUsername(val))
    else setUsernameError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const uErr = validateUsername(username.trim())
    if (uErr) { setUsernameError(uErr); return }

    setLoading(true)

    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username.trim())
      .maybeSingle()

    if (existing) {
      setError('Username is already taken')
      setLoading(false)
      return
    }

    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: username.trim() } },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    if (!data?.session) {
      setEmailSent(true)
      setLoading(false)
      return
    }

    navigate('/', { replace: true })
  }

  const onFocus = (e) => { e.currentTarget.style.borderColor = 'rgba(255,107,53,0.5)'; e.currentTarget.style.background = 'var(--db-border-default)' }
  const onBlur = (e, err) => { e.currentTarget.style.borderColor = err ? 'rgba(255,45,45,0.4)' : 'var(--db-border-default)'; e.currentTarget.style.background = 'var(--db-border-subtle)' }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--db-bg-page)', display: 'flex', position: 'relative', overflow: 'hidden', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

      {/* Background glow */}
      <div style={{ position: 'absolute', top: '-5%', left: '-10%', width: 500, height: 500, background: 'radial-gradient(circle, rgba(255,107,53,0.06) 0%, transparent 65%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-10%', right: '-5%', width: 400, height: 400, background: 'radial-gradient(circle, rgba(80,100,255,0.04) 0%, transparent 65%)', pointerEvents: 'none' }} />

      {/* Left brand panel */}
      <div className="hidden lg:flex" style={{
        width: 420, flexShrink: 0, flexDirection: 'column', justifyContent: 'center',
        alignItems: 'flex-start', padding: '0 56px',
        borderRight: '1px solid var(--db-border-subtle)',
      }}>
        <DobberLogo size={52} style={{ marginBottom: 48 }} />
        <div style={{ fontFamily: 'var(--db-font-display)', fontSize: 64, letterSpacing: '0.04em', color: 'var(--db-text-primary)', lineHeight: 0.92, marginBottom: 20 }}>
          START<br />
          <span style={{ color: '#ff6b35' }}>PLAYING</span><br />
          TODAY
        </div>
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 14, fontWeight: 400, color: 'var(--db-text-ghost)', lineHeight: 1.6, maxWidth: 280 }}>
          Free account. One bingo card per live game. Compete for prizes every night.
        </p>
        <p style={{ marginTop: 32, fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: '#ff6b35', textDecoration: 'none', fontWeight: 600 }}>
            Log in →
          </Link>
        </p>
      </div>

      {/* Right: form */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 24px' }}>
        <div style={{ width: '100%', maxWidth: 380 }}>

          {/* Mobile logo */}
          <div className="flex lg:hidden" style={{ flexDirection: 'column', alignItems: 'center', marginBottom: 36 }}>
            <DobberLogo size={44} />
            <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 32, letterSpacing: '6px', color: 'var(--db-text-primary)', marginTop: 10, lineHeight: 1 }}>
              DOBBER
            </span>
          </div>

          {emailSent ? (
            /* Email verification notice */
            <div style={{ textAlign: 'center', padding: '40px 24px' }}>
              <div style={{ fontSize: 52, marginBottom: 20, lineHeight: 1 }}>📬</div>
              <h2 style={{ fontFamily: 'var(--db-font-display)', fontSize: 28, letterSpacing: '0.06em', color: 'var(--db-text-primary)', margin: '0 0 12px' }}>
                CHECK YOUR EMAIL
              </h2>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)', lineHeight: 1.7, margin: '0 0 8px' }}>
                We sent a verification link to
              </p>
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: '#ff6b35', margin: '0 0 28px', fontWeight: 600 }}>
                {email}
              </p>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)', margin: '0 0 28px' }}>
                Click the link to verify, then log in. Check spam if you don't see it.
              </p>
              <Link
                to="/login"
                style={{
                  fontFamily: 'var(--db-font-display)', fontSize: 16, letterSpacing: '0.1em',
                  color: '#fff', background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                  borderRadius: 6, padding: '10px 28px', textDecoration: 'none', display: 'inline-block',
                  boxShadow: '0 4px 16px rgba(255,107,53,0.35)',
                }}
              >
                GO TO LOGIN
              </Link>
            </div>
          ) : (
            <>
              <div style={{ marginBottom: 28 }}>
                <h1 style={{ fontFamily: 'var(--db-font-display)', fontSize: 32, letterSpacing: '0.06em', color: 'var(--db-text-primary)', lineHeight: 1, margin: '0 0 8px' }}>
                  CREATE ACCOUNT
                </h1>
                <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-ghost)', margin: 0 }}>
                  It's free. No credit card needed.
                </p>
              </div>

              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label htmlFor="username" style={labelStyle}>Username</label>
                  <input
                    id="username"
                    type="text"
                    required
                    minLength={3}
                    maxLength={20}
                    value={username}
                    onChange={handleUsernameChange}
                    placeholder="pick a handle"
                    style={{ ...fieldStyle, borderColor: usernameError ? 'rgba(255,45,45,0.4)' : 'var(--db-border-default)' }}
                    onFocus={onFocus}
                    onBlur={(e) => onBlur(e, usernameError)}
                  />
                  {usernameError && (
                    <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: '#ff5555', marginTop: 5, fontWeight: 500 }}>
                      {usernameError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="email" style={labelStyle}>Email</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    style={fieldStyle}
                    onFocus={onFocus}
                    onBlur={(e) => onBlur(e, false)}
                  />
                </div>

                <div>
                  <label htmlFor="password" style={labelStyle}>Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="min 6 characters"
                    style={fieldStyle}
                    onFocus={onFocus}
                    onBlur={(e) => onBlur(e, false)}
                  />
                </div>

                <div style={{ background: 'rgba(255,107,53,0.05)', border: '1px solid rgba(255,107,53,0.12)', borderRadius: 6, padding: '10px 14px' }}>
                  <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'var(--db-text-ghost)', margin: 0, lineHeight: 1.6 }}>
                    A verification email will be sent after sign up.
                  </p>
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
                    width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                    background: loading ? 'var(--db-border-default)' : 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                    color: loading ? 'var(--db-text-ghost)' : '#fff',
                    fontFamily: 'var(--db-font-display)', fontSize: 18, letterSpacing: '0.1em',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    boxShadow: loading ? 'none' : '0 4px 16px rgba(255,107,53,0.35)',
                    transition: 'opacity 120ms ease, box-shadow 120ms ease',
                    marginTop: 4,
                  }}
                  onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.9' }}
                  onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1' }}
                >
                  {loading ? 'CREATING ACCOUNT…' : 'CREATE ACCOUNT'}
                </button>
              </form>

              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-ghost)', marginTop: 24, textAlign: 'center' }}>
                Already have an account?{' '}
                <Link
                  to="/login"
                  style={{ color: '#ff6b35', textDecoration: 'none', fontWeight: 600, transition: 'color 120ms' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = '#ff8855' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = '#ff6b35' }}
                >
                  Log in →
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default RegisterPage
