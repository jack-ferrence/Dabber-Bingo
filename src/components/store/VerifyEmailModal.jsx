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
      className="modal-overlay"
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(12,12,20,0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="modal-panel-in" style={{ background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-default)', borderRadius: 14, maxWidth: 400, width: '100%', padding: 28, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        {/* Close */}
        <button type="button" onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: 'var(--db-text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px', borderRadius: 4, transition: 'color 120ms ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-secondary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-ghost)' }}
        >✕</button>

        {/* Lock icon */}
        <div style={{ fontSize: 28, marginBottom: 12, color: '#ff6b35' }}>🔒</div>

        <h2 style={{ fontFamily: 'var(--db-font-display)', fontSize: 18, letterSpacing: '0.06em', color: 'var(--db-text-primary)', margin: '0 0 10px' }}>
          VERIFY YOUR EMAIL
        </h2>
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
          Verify your email to unlock purchases in the Dobs Store. You can still browse and play games without verifying.
        </p>

        {email && (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-primary)', margin: '0 0 20px', background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 6, padding: '8px 12px' }}>
            {email}
          </p>
        )}

        {/* Primary button */}
        {status === 'sent' ? (
          <div style={{ marginBottom: 10 }}>
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, color: '#22c55e', margin: '0 0 10px' }}>
              ✓ Check your inbox
            </p>
            <button
              type="button"
              onClick={handleSend}
              disabled={cooldown > 0}
              style={{ width: '100%', background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 8, fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: cooldown > 0 ? 'var(--db-text-ghost)' : 'var(--db-text-muted)', padding: '9px 0', cursor: cooldown > 0 ? 'not-allowed' : 'pointer' }}
            >
              {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleSend}
            disabled={status === 'sending'}
            style={{ width: '100%', background: status === 'sending' ? 'var(--db-bg-hover)' : 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)', color: status === 'sending' ? 'var(--db-text-ghost)' : '#fff', border: 'none', borderRadius: 8, fontFamily: 'var(--db-font-display)', fontSize: 13, letterSpacing: '0.06em', padding: '10px 0', cursor: status === 'sending' ? 'wait' : 'pointer', marginBottom: 10, boxShadow: status === 'sending' ? 'none' : '0 4px 14px rgba(255,107,53,0.35)', transition: 'opacity 100ms ease' }}
            onMouseEnter={(e) => { if (status !== 'sending') e.currentTarget.style.opacity = '0.9' }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
          >
            {status === 'sending' ? 'SENDING...' : status === 'error' ? 'TRY AGAIN' : 'SEND VERIFICATION EMAIL'}
          </button>
        )}

        {/* Secondary button */}
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 8, fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-text-ghost)', padding: '8px 0', cursor: 'pointer', transition: 'background 100ms ease, color 100ms ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-secondary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-ghost)' }}
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
