import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import DobberBallIcon from '../components/ui/DobberBallIcon.jsx'

const PRESETS = [
  { cents: 300,  label: '$3',  tag: 'Buy us a coffee' },
  { cents: 500,  label: '$5',  tag: 'Most popular' },
  { cents: 1000, label: '$10', tag: 'Big supporter' },
  { cents: 2500, label: '$25', tag: 'Legend tier' },
]

const PERKS = [
  { emoji: 'dobber_ball', text: 'Supporter badge on your profile' },
  { emoji: '⭐', text: 'Priority access to new features' },
  { emoji: '🙏', text: 'Keep Dobber Bingo free for everyone' },
]

export default function ContributePage() {
  const { user } = useAuth()
  const [params] = useSearchParams()
  const [selectedCents, setSelectedCents] = useState(500)
  const [customValue, setCustomValue] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [isSupporter, setIsSupporter] = useState(false)

  const status = params.get('status')

  // Check supporter status
  useEffect(() => {
    if (!user) return
    supabase
      .from('user_items')
      .select('id')
      .eq('user_id', user.id)
      .eq('item_id', 'badge_supporter')
      .maybeSingle()
      .then(({ data }) => { if (data) setIsSupporter(true) })
  }, [user])

  const amountCents = useCustom
    ? Math.round(parseFloat(customValue || '0') * 100)
    : selectedCents

  const amountDisplay = useCustom
    ? (parseFloat(customValue || '0') > 0 ? `$${parseFloat(customValue).toFixed(2)}` : '$—')
    : PRESETS.find((p) => p.cents === selectedCents)?.label ?? '$—'

  const handleContribute = async () => {
    if (!user) return
    if (amountCents < 100) { setError('Minimum contribution is $1.'); return }
    if (amountCents > 50000) { setError('Maximum contribution is $500.'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/create-donation-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amountCents }),
      })
      const json = await res.json()
      if (!res.ok || !json.url) throw new Error(json.error || 'Could not create session')
      window.location.href = json.url
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100%', background: '#0c0c14', padding: '24px 20px 48px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* Header */}
        <h1 style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'clamp(28px, 5vw, 40px)',
          fontWeight: 900, letterSpacing: '0.06em', color: '#ff6b35',
          margin: '0 0 6px', lineHeight: 1,
        }}>
          SUPPORT DOBBER
        </h1>
        <p style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 13, color: 'rgba(255,255,255,0.45)',
          margin: '0 0 28px',
        }}>
          Dobber Bingo is completely free to play. If you enjoy it, a small contribution goes a long way.
        </p>

        {/* Success / Cancel banners */}
        {status === 'success' && (
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 20,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
          }}>
            <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.06em', color: '#22c55e', margin: 0 }}>
              🎉 THANK YOU FOR SUPPORTING DOBBER!
            </p>
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '4px 0 0' }}>
              Your supporter badge will appear shortly.
            </p>
          </div>
        )}
        {status === 'cancelled' && (
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 20,
            background: 'rgba(255,70,70,0.06)', border: '1px solid rgba(255,70,70,0.2)',
          }}>
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'rgba(255,100,100,0.8)', margin: 0 }}>
              Payment cancelled — no charge was made.
            </p>
          </div>
        )}

        {/* Supporter status pill */}
        {isSupporter && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 20, marginBottom: 20,
            background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)',
          }}>
            <DobberBallIcon size={14} />
            <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: '#ff6b35' }}>
              SUPPORTER
            </span>
          </div>
        )}

        {/* Perks */}
        <div style={{
          background: '#12121e', border: '1px solid rgba(255,255,255,0.05)',
          borderRadius: 10, padding: '16px 18px', marginBottom: 24,
        }}>
          <p style={{
            fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.1em',
            color: 'rgba(255,255,255,0.35)', margin: '0 0 12px',
          }}>
            WHAT YOU GET
          </p>
          {PERKS.map((perk, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < PERKS.length - 1 ? 10 : 0 }}>
              {perk.emoji === 'dobber_ball'
                ? <DobberBallIcon size={16} />
                : <span style={{ fontSize: 16, flexShrink: 0 }}>{perk.emoji}</span>}
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
                {perk.text}
              </span>
            </div>
          ))}
        </div>

        {/* Preset amounts */}
        <p style={{
          fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.1em',
          color: 'rgba(255,255,255,0.35)', margin: '0 0 10px',
        }}>
          CHOOSE AMOUNT
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
          {PRESETS.map((p) => {
            const active = !useCustom && selectedCents === p.cents
            return (
              <button
                key={p.cents}
                type="button"
                onClick={() => { setUseCustom(false); setSelectedCents(p.cents) }}
                style={{
                  padding: '12px 4px', borderRadius: 8, cursor: 'pointer',
                  background: active ? 'rgba(255,107,53,0.12)' : '#12121e',
                  border: active ? '1.5px solid rgba(255,107,53,0.5)' : '1px solid rgba(255,255,255,0.07)',
                  transition: 'background 120ms, border-color 120ms',
                }}
              >
                <div style={{ fontFamily: 'var(--db-font-display)', fontSize: 20, fontWeight: 900, letterSpacing: '0.02em', color: active ? '#ff6b35' : '#e8e8f4' }}>
                  {p.label}
                </div>
                <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: active ? 'rgba(255,107,53,0.7)' : 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                  {p.tag}
                </div>
              </button>
            )
          })}
        </div>

        {/* Custom amount */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <span style={{
            position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)',
            fontFamily: 'var(--db-font-mono)', fontSize: 14, color: useCustom ? '#ff6b35' : 'rgba(255,255,255,0.3)',
            pointerEvents: 'none',
          }}>$</span>
          <input
            type="number"
            min="1"
            max="500"
            step="1"
            placeholder="Custom amount"
            value={customValue}
            onFocus={() => setUseCustom(true)}
            onChange={(e) => { setUseCustom(true); setCustomValue(e.target.value) }}
            style={{
              width: '100%', padding: '12px 12px 12px 26px', borderRadius: 8,
              background: '#12121e',
              border: useCustom ? '1.5px solid rgba(255,107,53,0.4)' : '1px solid rgba(255,255,255,0.07)',
              fontFamily: 'var(--db-font-mono)', fontSize: 14, color: '#e8e8f4',
              outline: 'none', boxSizing: 'border-box',
              transition: 'border-color 120ms',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff4444',
            margin: '-16px 0 16px',
          }}>{error}</p>
        )}

        {/* CTA */}
        <button
          type="button"
          onClick={handleContribute}
          disabled={loading || amountCents < 100}
          style={{
            width: '100%', padding: '15px', borderRadius: 8, border: 'none',
            background: loading || amountCents < 100
              ? 'rgba(255,107,53,0.25)'
              : 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
            fontFamily: 'var(--db-font-display)', fontSize: 16, fontWeight: 900,
            letterSpacing: '0.05em', color: loading || amountCents < 100 ? 'rgba(255,255,255,0.4)' : '#fff',
            cursor: loading || amountCents < 100 ? 'not-allowed' : 'pointer',
            boxShadow: loading || amountCents < 100 ? 'none' : '0 4px 20px rgba(255,107,53,0.35)',
            transition: 'background 150ms, box-shadow 150ms',
          }}
        >
          {loading ? 'REDIRECTING…' : `CONTRIBUTE ${amountDisplay}`}
        </button>

        <p style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 10,
          color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 12,
        }}>
          Secure checkout via Stripe. No account required.
        </p>
      </div>
    </div>
  )
}
