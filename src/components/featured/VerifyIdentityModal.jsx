import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'

const inputStyle = {
  width: '100%',
  background: 'var(--db-bg-elevated)',
  border: '1px solid var(--db-border-default)',
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: 'var(--db-font-ui)',
  fontSize: 13,
  color: 'var(--db-text-primary)',
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color 120ms ease',
}

function StepIndicator({ number, label, done, active }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
      opacity: done ? 0.6 : 1,
    }}>
      <div style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#22c55e' : active ? '#ff6b35' : 'var(--db-bg-hover)',
        color: done || active ? '#fff' : 'var(--db-text-ghost)',
        fontFamily: 'var(--db-font-display)', fontSize: 12,
      }}>
        {done ? '✓' : number}
      </div>
      <span style={{
        fontFamily: 'var(--db-font-display)', fontSize: 12,
        color: done ? '#22c55e' : active ? 'var(--db-text-primary)' : 'var(--db-text-ghost)',
        letterSpacing: '0.06em',
        textDecoration: done ? 'line-through' : 'none',
      }}>
        {label}
      </span>
    </div>
  )
}

export default function VerifyIdentityModal({ onClose, onVerified }) {
  const { user } = useAuth()
  const [emailVerified, setEmailVerified] = useState(false)
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneSubmitting, setPhoneSubmitting] = useState(false)
  const [phoneSuccess, setPhoneSuccess] = useState(false)
  const [emailResent, setEmailResent] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const check = async () => {
      setEmailVerified(!!user.email_confirmed_at)

      const { data: profile } = await supabase
        .from('profiles')
        .select('phone_verified, phone_number')
        .eq('id', user.id)
        .single()

      if (profile) {
        setPhoneVerified(profile.phone_verified || false)
        if (profile.phone_number) setPhoneNumber(profile.phone_number)
      }
      setLoading(false)
    }
    check()
  }, [user])

  const handleResendEmail = async () => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })
    if (!error) setEmailResent(true)
    setTimeout(() => setEmailResent(false), 5000)
  }

  const handleSubmitPhone = async () => {
    setPhoneError('')
    const cleaned = phoneNumber.replace(/[^0-9+]/g, '')
    const digitsOnly = cleaned.replace(/[^0-9]/g, '')

    if (digitsOnly.length < 10) {
      setPhoneError('Enter a valid phone number (at least 10 digits)')
      return
    }

    setPhoneSubmitting(true)

    const { data, error } = await supabase.rpc('submit_phone_number', { p_phone: cleaned })

    if (error) {
      setPhoneError(error.message)
      setPhoneSubmitting(false)
      return
    }

    if (data?.success) {
      setPhoneVerified(true)
      setPhoneSuccess(true)
      if (emailVerified) {
        setTimeout(() => onVerified?.(), 1000)
      }
    } else {
      setPhoneError(data?.message || data?.reason || 'Could not verify phone')
    }
    setPhoneSubmitting(false)
  }

  const allVerified = emailVerified && phoneVerified
  const activeStep = !emailVerified ? 1 : !phoneVerified ? 2 : 0

  if (loading) {
    return (
      <div className="modal-overlay" style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ background: 'var(--db-bg-surface)', borderRadius: 12, padding: 32, textAlign: 'center', border: '1px solid var(--db-border-default)' }}>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-ghost)' }}>Checking verification...</span>
        </div>
      </div>
    )
  }

  return (
    <div
      className="modal-overlay"
      style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        className="modal-panel-in"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--db-bg-surface)',
          border: '1px solid var(--db-border-default)',
          borderRadius: 14,
          padding: 28, width: '100%', maxWidth: 420,
          maxHeight: '90vh', overflowY: 'auto',
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h3 style={{ fontFamily: 'var(--db-font-display)', fontSize: 16, letterSpacing: '0.06em', color: 'var(--db-text-primary)', margin: 0 }}>
              VERIFY IDENTITY
            </h3>
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-ghost)', margin: '4px 0 0' }}>
              Required for featured game entry
            </p>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--db-text-muted)', fontSize: 16, cursor: 'pointer', padding: '2px 6px', borderRadius: 4, transition: 'color 120ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-ghost)' }}
          >✕</button>
        </div>

        {/* Why message */}
        <div style={{
          background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.18)',
          borderRadius: 6, padding: '10px 14px', marginBottom: 20,
        }}>
          <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)', margin: 0, lineHeight: 1.6 }}>
            Featured games award real prizes. To prevent multi-accounting, we require email and phone verification. Each phone number can only be linked to one account.
          </p>
        </div>

        {/* Steps */}
        <StepIndicator number={1} label="VERIFY EMAIL" done={emailVerified} active={activeStep === 1} />
        <StepIndicator number={2} label="VERIFY PHONE NUMBER" done={phoneVerified} active={activeStep === 2} />

        <div style={{ borderTop: '1px solid var(--db-border-subtle)', marginTop: 8, paddingTop: 16 }}>
          {/* Email section */}
          {!emailVerified && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--db-text-primary)', margin: '0 0 8px' }}>
                Step 1: Verify your email
              </p>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)', margin: '0 0 12px', lineHeight: 1.6 }}>
                Check your inbox for a verification link from Dobber. Email: <span style={{ color: '#ff6b35' }}>{user?.email}</span>
              </p>
              <button type="button" onClick={handleResendEmail}
                style={{
                  padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: emailResent ? 'rgba(34,197,94,0.1)' : 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                  color: emailResent ? '#22c55e' : '#fff',
                  fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.06em',
                  transition: 'opacity 100ms ease',
                }}
                onMouseEnter={(e) => { if (!emailResent) e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
              >
                {emailResent ? '✓ EMAIL SENT — CHECK INBOX' : 'RESEND VERIFICATION EMAIL'}
              </button>
            </div>
          )}

          {/* Phone section — only show when email is done */}
          {emailVerified && !phoneVerified && (
            <div>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--db-text-primary)', margin: '0 0 8px' }}>
                Step 2: Add your phone number
              </p>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
                US numbers only for now. Each phone can only be linked to one account.
              </p>

              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{ ...inputStyle, flex: 1 }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#ff6b35' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--db-border-default)' }}
                />
                <button type="button" onClick={handleSubmitPhone} disabled={phoneSubmitting}
                  style={{
                    padding: '0 16px', borderRadius: 6, border: 'none', cursor: phoneSubmitting ? 'wait' : 'pointer',
                    background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)', color: '#fff', flexShrink: 0,
                    fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.06em',
                    opacity: phoneSubmitting ? 0.5 : 1, transition: 'opacity 100ms ease',
                  }}>
                  {phoneSubmitting ? '...' : 'VERIFY'}
                </button>
              </div>

              {phoneError && (
                <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: '#ff4444', marginTop: 6 }}>
                  {phoneError}
                </p>
              )}
            </div>
          )}

          {/* Success state */}
          {phoneSuccess && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.06em', color: '#22c55e', margin: '0 0 4px' }}>
                ✓ PHONE VERIFIED
              </p>
            </div>
          )}

          {/* All done */}
          {allVerified && !phoneSuccess && (
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.06em', color: '#22c55e', margin: '0 0 8px' }}>
                ✓ FULLY VERIFIED
              </p>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)' }}>
                You're eligible for all featured games!
              </p>
            </div>
          )}
        </div>

        {/* Close / Continue */}
        <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
          {allVerified ? (
            <button type="button" onClick={onVerified || onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)', color: '#fff',
                fontFamily: 'var(--db-font-display)', fontSize: 13, letterSpacing: '0.06em',
                boxShadow: '0 4px 14px rgba(255,107,53,0.35)', transition: 'opacity 100ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              CONTINUE TO FEATURED GAME
            </button>
          ) : (
            <button type="button" onClick={onClose}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 8, border: '1px solid var(--db-border-default)',
                background: 'var(--db-bg-elevated)', color: 'var(--db-text-muted)', cursor: 'pointer',
                fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500,
                transition: 'background 100ms ease, color 100ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
            >
              I'll do this later
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
