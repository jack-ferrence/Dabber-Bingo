import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function VerifyEmailModal({ email, onClose }) {
  const [status, setStatus] = useState(null) // null | 'sending' | 'sent' | 'error'
  const [cooldown, setCooldown] = useState(0)

  const handleSend = async () => {
    if (status === 'sending' || cooldown > 0) return
    setStatus('sending')
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: window.location.origin + '/store' },
    })
    if (error) {
      setStatus('error')
      return
    }
    setStatus('sent')
    // 60-second cooldown
    setCooldown(60)
    const interval = setInterval(() => {
      setCooldown((c) => {
        if (c <= 1) { clearInterval(interval); return 0 }
        return c - 1
      })
    }, 1000)
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(12,12,20,0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 8, maxWidth: 400, width: '100%', padding: 28, position: 'relative' }}>
        {/* Close */}
        <button type="button" onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#555577', cursor: 'pointer', fontFamily: 'var(--db-font-mono)', fontSize: 16, lineHeight: 1, padding: 4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0f0' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
        >✕</button>

        {/* Lock icon */}
        <div style={{ fontSize: 28, marginBottom: 12, color: '#ff6b35' }}>🔒</div>

        <h2 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 800, color: '#e0e0f0', margin: '0 0 10px', letterSpacing: '0.06em' }}>
          VERIFY YOUR EMAIL
        </h2>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa', margin: '0 0 14px', lineHeight: 1.6 }}>
          Verify your email to unlock purchases in the Dobs Store. You can still browse and play games without verifying.
        </p>

        {email && (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#e0e0f0', margin: '0 0 20px', background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 4, padding: '8px 12px' }}>
            {email}
          </p>
        )}

        {/* Primary button */}
        {status === 'sent' ? (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#22c55e', margin: '0 0 10px' }}>
              ✓ CHECK YOUR INBOX
            </p>
            <button
              type="button"
              onClick={handleSend}
              disabled={cooldown > 0}
              style={{ width: '100%', background: 'none', border: '1px solid #2a2a44', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: cooldown > 0 ? '#3a3a55' : '#8888aa', padding: '8px 0', cursor: cooldown > 0 ? 'not-allowed' : 'pointer', letterSpacing: '0.06em' }}
            >
              {cooldown > 0 ? `RESEND IN ${cooldown}s` : 'RESEND'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={status === 'sending'}
            style={{ width: '100%', background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', padding: '10px 0', cursor: status === 'sending' ? 'wait' : 'pointer', marginBottom: 10, transition: 'background 100ms ease' }}
            onMouseEnter={(e) => { if (status !== 'sending') e.currentTarget.style.background = '#ff8855' }}
            onMouseLeave={(e) => { if (status !== 'sending') e.currentTarget.style.background = '#ff6b35' }}
          >
            {status === 'sending' ? 'SENDING...' : status === 'error' ? 'TRY AGAIN' : 'SEND VERIFICATION EMAIL'}
          </button>
        )}

        {/* Secondary button */}
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', background: 'none', border: '1px solid #2a2a44', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', padding: '8px 0', cursor: 'pointer', letterSpacing: '0.06em' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#8888aa'; e.currentTarget.style.borderColor = '#3a3a55' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#555577'; e.currentTarget.style.borderColor = '#2a2a44' }}
        >
          MAYBE LATER
        </button>
      </div>
    </div>
  )
}
