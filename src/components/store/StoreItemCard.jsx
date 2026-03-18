import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getFontFamily, getBadge } from '../../lib/fontMap'

// ── Previews ─────────────────────────────────────────────────────────────────

function ColorPreview({ hex }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 72, gap: 6 }}>
      <span style={{ width: 34, height: 34, borderRadius: '50%', background: hex, display: 'block', boxShadow: `0 0 14px ${hex}66`, flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: hex }}>YourName</span>
    </div>
  )
}

function FontPreview({ fontKey }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72 }}>
      <span style={{ fontFamily: getFontFamily(fontKey), fontSize: 18, fontWeight: 700, color: '#e0e0f0' }}>
        YourName
      </span>
    </div>
  )
}

function BadgePreview({ emoji, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 72, gap: 4 }}>
      <span style={{ fontSize: 32, lineHeight: 1 }}>{emoji}</span>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#555577', letterSpacing: '0.12em' }}>{label}</span>
    </div>
  )
}

function SkinPreview({ skinClass }) {
  const cellStyle = (i) => {
    const isMarked = i % 3 === 1
    switch (skinClass) {
      case 'neon':
        return isMarked
          ? { background: '#1a1a2e', border: '1px solid rgba(255,107,53,0.7)', boxShadow: '0 0 6px rgba(255,107,53,0.3)' }
          : { background: '#0c0c14', border: '1px solid rgba(255,107,53,0.35)' }
      case 'retro':
        return isMarked
          ? { background: '#2a1a10', border: '1px solid #ff6b35' }
          : {
              background: '#0c0c14',
              border: '1px solid #2a2a44',
              backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(255,255,255,0.02) 1px,rgba(255,255,255,0.02) 2px)',
            }
      case 'minimal':
        return isMarked
          ? { background: 'rgba(255,107,53,0.06)', border: '0.5px solid rgba(255,107,53,0.5)', borderRadius: 1 }
          : { background: 'transparent', border: '0.5px solid #2a2a44', borderRadius: 1 }
      case 'gold':
        return isMarked
          ? { background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b' }
          : { background: '#0c0c14', border: '1px solid rgba(245,158,11,0.25)' }
      default:
        return isMarked
          ? { background: '#2a1a10', border: '1px solid #ff6b35' }
          : { background: '#1a1a2e', border: '1px solid #2a2a44' }
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 20px)', gap: 3 }}>
        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <div key={i} style={{ width: 20, height: 20, borderRadius: 2, ...cellStyle(i) }} />
        ))}
      </div>
    </div>
  )
}

function ItemPreview({ item }) {
  switch (item.category) {
    case 'name_color':
      return <ColorPreview hex={item.metadata?.hex || '#e0e0f0'} />
    case 'name_font':
      return <FontPreview fontKey={item.metadata?.font || 'mono'} />
    case 'badge': {
      const badge = getBadge(item.id) || { emoji: item.metadata?.emoji || '?', label: item.metadata?.label || '' }
      return <BadgePreview emoji={badge.emoji} label={badge.label} />
    }
    case 'board_skin':
      return <SkinPreview skinClass={item.metadata?.class || 'default'} />
    default:
      return null
  }
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function StoreItemCard({ item, owned, equipped, dabsBalance, isEmailVerified = true, onPurchased, onEquipped }) {
  const [confirming, setConfirming] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [equipping, setEquipping] = useState(false)
  const [toast, setToast] = useState(null)
  const [err, setErr] = useState('')

  const isFree = (item.price ?? item.cost ?? 0) === 0
  const price = item.price ?? item.cost ?? 0
  const canAfford = isFree || (dabsBalance !== null && dabsBalance >= price)
  const canBuy = isEmailVerified

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(null), 2200)
  }

  const handleBuyClick = () => {
    if (isFree) { doEquip(); return }
    setErr('')
    setConfirming(true)
  }

  const handleConfirmPurchase = async () => {
    setConfirming(false)
    setPurchasing(true)
    setErr('')
    const { data, error } = await supabase.rpc('purchase_store_item', { p_item_id: item.id })
    setPurchasing(false)
    if (error) { setErr(error.message); return }
    if (!data?.success) {
      if (data?.reason === 'insufficient_dabs') setErr(`Need ${data.cost} Dabs (have ${data.balance})`)
      else if (data?.reason === 'already_owned') showToast('Already owned')
      else setErr(data?.reason || 'Purchase failed')
      return
    }
    showToast('Purchased!')
    onPurchased?.(item)
    doEquip()
  }

  const doEquip = async () => {
    setEquipping(true)
    const { data, error } = await supabase.rpc('equip_store_item', { p_item_id: item.id })
    setEquipping(false)
    if (error) { setErr(error.message); return }
    if (!data?.success) { setErr(data?.reason || 'Equip failed'); return }
    onEquipped?.(item)
  }

  const handleUnequip = async () => {
    if (item.category !== 'badge') return
    setEquipping(true)
    const { error } = await supabase.rpc('unequip_badge')
    setEquipping(false)
    if (error) { setErr(error.message); return }
    onEquipped?.(null, 'badge')
  }

  return (
    <div
      style={{
        background: '#12121e',
        border: `1px solid ${equipped ? '#ff6b35' : '#2a2a44'}`,
        borderRadius: 6,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'border-color 150ms ease',
      }}
    >
      {/* Preview */}
      <div style={{ borderBottom: '1px solid #1a1a2e', padding: '4px 0' }}>
        <ItemPreview item={item} />
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#e0e0f0', margin: '0 0 3px' }}>
          {item.name}
        </p>
        {item.description && (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577', letterSpacing: '0.04em', margin: 0 }}>
            {item.description}
          </p>
        )}
      </div>

      {/* Error */}
      {err && (
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#ff2d2d', padding: '0 12px 6px', margin: 0 }}>
          {err}
        </p>
      )}

      {/* Actions */}
      <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {toast ? (
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: '#22c55e' }}>
            ✓ {toast}
          </span>
        ) : confirming ? (
          <div>
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#8888aa', margin: '0 0 5px' }}>
              Buy <strong style={{ color: '#e0e0f0' }}>{item.name}</strong> for <strong style={{ color: '#ff6b35' }}>{price} ◈</strong>?
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleConfirmPurchase}
                style={{ flex: 1, background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 3, fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '5px 0', cursor: 'pointer' }}
              >
                CONFIRM
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{ flex: 1, background: 'none', color: '#555577', border: '1px solid #2a2a44', borderRadius: 3, fontFamily: 'var(--db-font-mono)', fontSize: 10, padding: '5px 0', cursor: 'pointer' }}
              >
                CANCEL
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Purchase row */}
            {!owned && !isFree && (
              <button
                type="button"
                onClick={canBuy ? handleBuyClick : undefined}
                disabled={purchasing || !canAfford || !canBuy}
                style={{
                  width: '100%',
                  background: !canBuy ? '#1a1a2e' : canAfford ? '#ff6b35' : '#1a1a2e',
                  color: !canBuy ? '#3a3a55' : canAfford ? '#0c0c14' : '#3a3a55',
                  border: 'none', borderRadius: 3,
                  fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
                  letterSpacing: '0.06em', padding: '6px 0',
                  cursor: (!canBuy || !canAfford || purchasing) ? 'not-allowed' : 'pointer',
                  transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => { if (canBuy && canAfford && !purchasing) e.currentTarget.style.background = '#ff8855' }}
                onMouseLeave={(e) => { if (canBuy && canAfford && !purchasing) e.currentTarget.style.background = '#ff6b35' }}
                title={!canBuy ? 'Verify your email to unlock purchases' : !canAfford ? `Need ${price} Dabs (have ${dabsBalance ?? 0})` : undefined}
              >
                {purchasing ? '...' : !canBuy ? '🔒 VERIFY TO BUY' : `◈ ${price}`}
              </button>
            )}

            {(owned || isFree) && (
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: isFree ? '#555577' : '#8888aa', letterSpacing: '0.06em' }}>
                {isFree ? 'FREE' : 'OWNED ✓'}
              </span>
            )}

            {/* Equip row */}
            {(owned || isFree) && (
              equipped ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#ff6b35', letterSpacing: '0.06em' }}>
                    EQUIPPED ✓
                  </span>
                  {item.category === 'badge' && (
                    <button
                      type="button"
                      onClick={handleUnequip}
                      disabled={equipping}
                      style={{ background: 'none', color: '#555577', border: '1px solid #2a2a44', borderRadius: 3, fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 600, padding: '2px 7px', cursor: 'pointer', letterSpacing: '0.05em' }}
                    >
                      UNEQUIP
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={doEquip}
                  disabled={equipping}
                  style={{ width: '100%', background: 'none', color: '#8888aa', border: '1px solid #2a2a44', borderRadius: 3, fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '5px 0', cursor: equipping ? 'wait' : 'pointer', transition: 'all 100ms ease' }}
                  onMouseEnter={(e) => { if (!equipping) { e.currentTarget.style.borderColor = '#ff6b35'; e.currentTarget.style.color = '#ff6b35' } }}
                  onMouseLeave={(e) => { if (!equipping) { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#8888aa' } }}
                >
                  {equipping ? '...' : 'EQUIP'}
                </button>
              )
            )}
          </>
        )}
      </div>
    </div>
  )
}
