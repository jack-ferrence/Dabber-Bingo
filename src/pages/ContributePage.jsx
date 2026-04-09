import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import DobberBallIcon from '../components/ui/DobberBallIcon.jsx'
import { isIOS } from '../lib/platform.js'
import { getTipProducts, purchaseTip, restorePurchases, isPurchasesReady } from '../lib/purchases.js'

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

  // iOS IAP state
  const [iapProducts, setIapProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [iapLoading, setIapLoading] = useState(false)
  const [iapSuccess, setIapSuccess] = useState(false)

  const status = params.get('status')
  const onIOS = isIOS()

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

  // Fetch IAP products on iOS
  useEffect(() => {
    if (!onIOS) return
    let cancelled = false
    const load = async () => {
      // Wait briefly for RevenueCat to init
      await new Promise((r) => setTimeout(r, 500))
      if (!isPurchasesReady()) return
      const products = await getTipProducts()
      if (!cancelled && products.length > 0) {
        setIapProducts(products)
        setSelectedProduct(products[0])
      }
    }
    load()
    return () => { cancelled = true }
  }, [onIOS])

  // ── Stripe flow (web) ──
  const amountCents = useCustom
    ? Math.round(parseFloat(customValue || '0') * 100)
    : selectedCents

  const amountDisplay = useCustom
    ? (parseFloat(customValue || '0') > 0 ? `$${parseFloat(customValue).toFixed(2)}` : '$—')
    : PRESETS.find((p) => p.cents === selectedCents)?.label ?? '$—'

  const handleContribute = async () => {
    if (!user) return
    if (amountCents < 100) { setError('The minimum is $1.'); return }
    if (amountCents > 50000) { setError('The maximum is $500 per contribution.'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/.netlify/functions/create-donation-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, amountCents }),
      })
      const json = await res.json()
      if (!res.ok || !json.url) throw new Error(json.error || 'Something went wrong — please try again.')
      window.location.href = json.url
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  // ── IAP flow (iOS) ──
  const handleIAPPurchase = async () => {
    if (!selectedProduct?.rcPackage) return
    setIapLoading(true)
    setError(null)
    const result = await purchaseTip(selectedProduct.rcPackage)
    setIapLoading(false)
    if (result.success) {
      setIapSuccess(true)
      setIsSupporter(true)
    } else if (result.cancelled) {
      // User cancelled — do nothing
    } else {
      setError(result.error || 'Purchase failed. Please try again.')
    }
  }

  const handleRestore = async () => {
    setIapLoading(true)
    setError(null)
    const info = await restorePurchases()
    setIapLoading(false)
    if (info) {
      setIsSupporter(true)
      setIapSuccess(true)
    } else {
      setError('No previous purchases found.')
    }
  }

  return (
    <div style={{ minHeight: '100%', background: 'var(--db-bg-page)', padding: '24px 20px 48px' }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>

        {/* Header */}
        <h1 style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'clamp(28px, 5vw, 40px)',
          fontWeight: 900, letterSpacing: '0.06em', color: 'var(--db-primary)',
          margin: '0 0 6px', lineHeight: 1,
        }}>
          SUPPORT DOBBER
        </h1>
        <p style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-base)', color: 'var(--db-text-muted)',
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
            <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)', fontWeight: 'var(--db-weight-bold)', letterSpacing: '0.06em', color: 'var(--db-success)', margin: 0 }}>
              🎉 THANK YOU FOR SUPPORTING DOBBER!
            </p>
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)', margin: '4px 0 0' }}>
              Your supporter badge will appear shortly.
            </p>
          </div>
        )}
        {status === 'cancelled' && (
          <div style={{
            padding: '14px 16px', borderRadius: 8, marginBottom: 20,
            background: 'rgba(255,70,70,0.06)', border: '1px solid rgba(255,70,70,0.2)',
          }}>
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'rgba(255,100,100,0.8)', margin: 0 }}>
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
            <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-sm)', fontWeight: 'var(--db-weight-bold)', letterSpacing: 'var(--db-tracking-wider)', color: 'var(--db-primary)' }}>
              SUPPORTER
            </span>
          </div>
        )}

        {/* Perks */}
        <div style={{
          background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
          borderRadius: 10, padding: '16px 18px', marginBottom: 24,
        }}>
          <p style={{
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xs)', letterSpacing: '0.1em',
            color: 'var(--db-text-ghost)', margin: '0 0 12px',
          }}>
            WHAT YOU GET
          </p>
          {PERKS.map((perk, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: i < PERKS.length - 1 ? 10 : 0 }}>
              {perk.emoji === 'dobber_ball'
                ? <DobberBallIcon size={16} />
                : <span style={{ fontSize: 'var(--db-text-lg)', flexShrink: 0 }}>{perk.emoji}</span>}
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-secondary)' }}>
                {perk.text}
              </span>
            </div>
          ))}
        </div>

        {/* iOS: In-App Purchase flow */}
        {onIOS ? (
          <div>
            {iapSuccess ? (
              <div style={{
                padding: '14px 16px', borderRadius: 8, marginBottom: 20,
                background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
              }}>
                <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-md)', fontWeight: 'var(--db-weight-bold)', letterSpacing: '0.06em', color: 'var(--db-success)', margin: 0 }}>
                  🎉 THANK YOU FOR SUPPORTING DOBBER!
                </p>
                <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)', margin: '4px 0 0' }}>
                  Your supporter badge will appear shortly.
                </p>
              </div>
            ) : iapProducts.length > 0 ? (
              <>
                <p style={{
                  fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xs)', letterSpacing: '0.1em',
                  color: 'var(--db-text-ghost)', margin: '0 0 10px',
                }}>
                  CHOOSE AMOUNT
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 20 }}>
                  {iapProducts.map((product) => {
                    const active = selectedProduct?.id === product.id
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                        style={{
                          padding: '14px 8px', borderRadius: 8, cursor: 'pointer',
                          background: active ? 'rgba(255,107,53,0.12)' : 'var(--db-bg-surface)',
                          border: active ? '1.5px solid rgba(255,107,53,0.5)' : '1px solid var(--db-border-subtle)',
                          transition: 'background 120ms, border-color 120ms',
                        }}
                      >
                        <div style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)', fontWeight: 900, color: active ? 'var(--db-primary)' : 'var(--db-text-primary)' }}>
                          {product.priceString}
                        </div>
                        <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)', color: active ? 'rgba(255,107,53,0.7)' : 'var(--db-text-ghost)', marginTop: 3 }}>
                          {product.title}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {error && (
                  <p style={{
                    fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-danger)',
                    margin: '0 0 16px',
                  }}>{error}</p>
                )}

                <button
                  type="button"
                  onClick={handleIAPPurchase}
                  disabled={iapLoading || !selectedProduct}
                  style={{
                    width: '100%', padding: '15px', borderRadius: 8, border: 'none',
                    background: iapLoading ? 'rgba(255,107,53,0.25)' : 'var(--db-gradient-primary)',
                    fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)', fontWeight: 900,
                    letterSpacing: '0.05em', color: iapLoading ? 'var(--db-text-muted)' : '#fff',
                    cursor: iapLoading ? 'not-allowed' : 'pointer',
                    boxShadow: iapLoading ? 'none' : '0 4px 20px rgba(255,107,53,0.35)',
                    transition: 'background 150ms, box-shadow 150ms',
                  }}
                >
                  {iapLoading ? 'PROCESSING…' : `SUPPORT ${selectedProduct?.priceString ?? ''}`}
                </button>

                <button
                  type="button"
                  onClick={handleRestore}
                  disabled={iapLoading}
                  style={{
                    width: '100%', padding: '12px', marginTop: 10, borderRadius: 8,
                    background: 'none', border: '1px solid var(--db-border-default)',
                    fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                    color: 'var(--db-text-ghost)', cursor: 'pointer',
                  }}
                >
                  Restore previous purchase
                </button>

                <p style={{
                  fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
                  color: 'var(--db-text-ghost)', textAlign: 'center', marginTop: 12,
                }}>
                  One-time purchase via Apple. Payment charged to your Apple ID.
                </p>
              </>
            ) : (
              <div style={{
                background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)',
                borderRadius: 10, padding: 20, textAlign: 'center',
              }}>
                <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-text-muted)' }}>
                  Loading support options…
                </p>
              </div>
            )}
          </div>
        ) : (
        <>
        {/* Preset amounts */}
        <p style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xs)', letterSpacing: '0.1em',
          color: 'var(--db-text-ghost)', margin: '0 0 10px',
        }}>
          CHOOSE AMOUNT
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 12 }}>
          {PRESETS.map((p) => {
            const active = !useCustom && selectedCents === p.cents
            return (
              <button
                key={p.cents}
                type="button"
                onClick={() => { setUseCustom(false); setSelectedCents(p.cents) }}
                style={{
                  padding: '12px 4px', borderRadius: 8, cursor: 'pointer',
                  background: active ? 'rgba(255,107,53,0.12)' : 'var(--db-bg-surface)',
                  border: active ? '1.5px solid rgba(255,107,53,0.5)' : '1px solid var(--db-border-subtle)',
                  transition: 'background 120ms, border-color 120ms',
                }}
              >
                <div style={{ fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)', fontWeight: 900, letterSpacing: '0.02em', color: active ? 'var(--db-primary)' : 'var(--db-text-primary)' }}>
                  {p.label}
                </div>
                <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-2xs)', color: active ? 'rgba(255,107,53,0.7)' : 'var(--db-text-ghost)', marginTop: 3 }}>
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
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-md)', color: useCustom ? 'var(--db-primary)' : 'var(--db-text-ghost)',
            pointerEvents: 'none',
          }}>$</span>
          <input
            type="number"
            min="1"
            max="500"
            step="1"
            aria-label="Custom contribution amount"
            placeholder="Custom amount"
            value={customValue}
            onFocus={() => setUseCustom(true)}
            onChange={(e) => { setUseCustom(true); setCustomValue(e.target.value) }}
            style={{
              width: '100%', padding: '12px 12px 12px 26px', borderRadius: 8,
              background: 'var(--db-bg-surface)',
              border: useCustom ? '1.5px solid rgba(255,107,53,0.4)' : '1px solid var(--db-border-subtle)',
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-md)', color: 'var(--db-text-primary)',
              boxSizing: 'border-box',
              transition: 'border-color 120ms',
            }}
          />
        </div>

        {/* Error */}
        {error && (
          <p style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)', color: 'var(--db-danger)',
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
              : 'var(--db-gradient-primary)',
            fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-lg)', fontWeight: 900,
            letterSpacing: '0.05em', color: loading || amountCents < 100 ? 'var(--db-text-muted)' : '#fff',
            cursor: loading || amountCents < 100 ? 'not-allowed' : 'pointer',
            boxShadow: loading || amountCents < 100 ? 'none' : '0 4px 20px rgba(255,107,53,0.35)',
            transition: 'background 150ms, box-shadow 150ms',
          }}
        >
          {loading ? 'REDIRECTING…' : `CONTRIBUTE ${amountDisplay}`}
        </button>

        <p style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-xs)',
          color: 'var(--db-text-ghost)', textAlign: 'center', marginTop: 12,
        }}>
          Secure checkout via Stripe. No account required.
        </p>
        </>
        )}
      </div>
    </div>
  )
}
