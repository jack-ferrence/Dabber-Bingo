import { useState } from 'react'

/**
 * Stubbed ad reward button. Shows "Watch Ad" UI, simulates a short delay,
 * then calls onReward. Replace the setTimeout with a real ad SDK later.
 */
export default function AdRewardButton({ onReward, label = 'Watch Ad to Double', disabled = false }) {
  const [state, setState] = useState('idle') // idle | loading | done

  const handleClick = async () => {
    if (state !== 'idle' || disabled) return
    setState('loading')

    // Stub: simulate ad playback (replace with real ad SDK)
    await new Promise((r) => setTimeout(r, 2000))

    setState('done')
    onReward?.()
  }

  if (state === 'done') {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '14px 24px', borderRadius: 10,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
          letterSpacing: 'var(--db-tracking-wide)', color: 'var(--db-success)',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        REWARD CLAIMED
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === 'loading'}
      style={{
        width: '100%', padding: '14px 24px', borderRadius: 10,
        background: state === 'loading'
          ? 'var(--db-bg-elevated)'
          : 'linear-gradient(135deg, rgba(255,107,53,0.15) 0%, rgba(255,107,53,0.05) 100%)',
        border: '1px solid rgba(255,107,53,0.25)',
        fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)',
        letterSpacing: 'var(--db-tracking-wide)',
        color: disabled ? 'var(--db-text-ghost)' : 'var(--db-primary)',
        cursor: disabled ? 'not-allowed' : state === 'loading' ? 'wait' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        transition: 'all 150ms ease',
      }}
    >
      {state === 'loading' ? (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ animation: 'db-spin 1s linear infinite' }}>
            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
          </svg>
          WATCHING AD...
        </>
      ) : (
        <>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <polygon points="5,3 13,8 5,13" fill="currentColor" />
          </svg>
          {label.toUpperCase()}
        </>
      )}
    </button>
  )
}
