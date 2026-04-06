import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getFontFamily, getBadge, EMOTE_MAP } from '../../lib/fontMap'
import DaubOverlay from '../game/DaubOverlay.jsx'
import DobberBallIcon from '../ui/DobberBallIcon.jsx'

// ── Previews ─────────────────────────────────────────────────────────────────

function ColorPreview({ hex }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 72, gap: 6 }}>
      <span style={{ width: 34, height: 34, borderRadius: '50%', background: hex, display: 'block', boxShadow: `0 0 14px ${hex}66`, flexShrink: 0 }} />
      <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, color: hex }}>YourName</span>
    </div>
  )
}

function FontPreview({ fontKey }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 72 }}>
      <span style={{ fontFamily: getFontFamily(fontKey), fontSize: 18, fontWeight: 700, color: 'var(--db-text-primary)' }}>
        YourName
      </span>
    </div>
  )
}

function BadgePreview({ emoji, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 72, gap: 4 }}>
      {emoji === 'dobber_ball'
        ? <DobberBallIcon size={32} />
        : <span style={{ fontSize: 32, lineHeight: 1 }}>{emoji}</span>}
      <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, fontWeight: 500, color: 'var(--db-text-muted)', letterSpacing: '0.06em' }}>{label}</span>
    </div>
  )
}

function SkinPreview({ skinClass }) {
  const cellStyle = (i) => {
    const isMarked = i % 3 === 1
    switch (skinClass) {
      case 'neon':
        return isMarked
          ? { background: 'var(--db-bg-elevated)', border: '1px solid rgba(255,107,53,0.7)', boxShadow: '0 0 6px rgba(255,107,53,0.3)' }
          : { background: 'var(--db-bg-page)', border: '1px solid rgba(255,107,53,0.35)' }
      case 'retro':
        return isMarked
          ? { background: '#2a1a10', border: '1px solid #ff6b35' }
          : {
              background: 'var(--db-bg-page)',
              border: '1px solid var(--db-bg-active)',
              backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(255,255,255,0.02) 1px,rgba(255,255,255,0.02) 2px)',
            }
      case 'minimal':
        return isMarked
          ? { background: 'rgba(255,107,53,0.06)', border: '0.5px solid rgba(255,107,53,0.5)', borderRadius: 1 }
          : { background: 'transparent', border: '0.5px solid var(--db-bg-active)', borderRadius: 1 }
      case 'gold':
        return isMarked
          ? { background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b' }
          : { background: 'var(--db-bg-page)', border: '1px solid rgba(245,158,11,0.25)' }
      case 'terminal':
        return isMarked
          ? { background: '#0a1a0a', border: '1px solid #33ff33', borderRadius: 0 }
          : { background: '#0a0a0a', border: '1px solid #1a3a1a', borderRadius: 0 }
      case 'courtside':
        return isMarked
          ? { background: 'rgba(90,58,18,0.8)', border: '2px solid rgba(255,255,255,0.35)', borderRadius: '50%' }
          : { background: 'rgba(61,37,8,0.6)', border: '1px solid rgba(255,255,255,0.10)', borderRadius: 2 }
      case 'scoreboard':
        return isMarked
          ? { background: '#0c0c0c', border: '1px solid #1a1a1a', boxShadow: '0 0 4px rgba(255,45,45,0.4)', borderRadius: 1 }
          : { background: '#0c0c0c', border: '1px solid #1a1a1a', borderRadius: 1 }
      case 'scratch':
        return isMarked
          ? { background: '#f5eed8', border: '1px solid #d0c0a0', borderRadius: 3 }
          : { background: '#b0a080', border: '1px solid #a09070', borderRadius: 3 }
      default:
        return isMarked
          ? { background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.4)' }
          : { background: 'var(--db-border-subtle)', border: '1px solid var(--db-border-subtle)' }
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

function DaubPreview({ daubStyle }) {
  const cells = [true, false, false, true]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(2, 28px)', gap: 3,
      justifyContent: 'center', alignContent: 'center', height: 72,
    }}>
      {cells.map((marked, i) => (
        <div key={i} style={{
          width: 28, height: 28, borderRadius: 4,
          background: marked ? 'linear-gradient(160deg, #2d1a0a 0%, #1e1008 100%)' : 'var(--db-border-subtle)',
          border: `1px solid ${marked ? 'rgba(255,107,53,0.5)' : 'var(--db-border-default)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative', overflow: 'hidden',
        }}>
          {marked && daubStyle === 'classic' && (
            <span style={{ fontSize: 8, color: '#ff6b35', position: 'absolute', right: 2, top: 1 }}>✓</span>
          )}
          {marked && daubStyle !== 'classic' && (
            <DaubOverlay style={daubStyle} size={28} animated={false} />
          )}
        </div>
      ))}
    </div>
  )
}

function EmotePreview({ itemId }) {
  const emote = EMOTE_MAP[itemId]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 72, gap: 4 }}>
      <span style={{ fontSize: 32, lineHeight: 1 }}>{emote?.emoji ?? '😊'}</span>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'var(--db-text-muted)' }}>{emote?.code ?? ''}</span>
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
    case 'daub_style':
      return <DaubPreview daubStyle={item.metadata?.style || 'classic'} />
    case 'chat_emote':
      return <EmotePreview itemId={item.id} />
    default:
      return null
  }
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function StoreItemCard({ item, owned, equipped, dobsBalance, isEmailVerified = true, onPurchased, onEquipped, onVerifyNeeded }) {
  const [confirming, setConfirming] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [equipping, setEquipping] = useState(false)
  const [toast, setToast] = useState(null)
  const [err, setErr] = useState('')

  const isFree = (item.price ?? item.cost ?? 0) === 0
  const price = item.price ?? item.cost ?? 0
  const canAfford = isFree || (dobsBalance !== null && dobsBalance >= price)
  const canBuy = isEmailVerified
  const isSupporterOnly = item.metadata?.supporter_only === true

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
      if (data?.reason === 'insufficient_dabs') setErr(`Need ${data.cost} Dobs (have ${data.balance})`)
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
        background: equipped
          ? 'linear-gradient(160deg, #1c1408 0%, #130e04 100%)'
          : 'var(--db-bg-elevated)',
        border: `1px solid ${equipped ? 'rgba(255,107,53,0.4)' : 'var(--db-border-default)'}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'border-color 150ms ease',
        boxShadow: equipped ? '0 0 0 1px rgba(255,107,53,0.1) inset' : 'none',
      }}
    >
      {/* Preview */}
      <div style={{ borderBottom: '1px solid var(--db-border-subtle)', padding: '4px 0' }}>
        <ItemPreview item={item} />
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 600, color: 'var(--db-text-primary)', margin: '0 0 3px' }}>
          {item.name}
        </p>
        {item.description && (
          <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-ghost)', margin: 0, lineHeight: 1.4 }}>
            {item.description}
          </p>
        )}
      </div>

      {/* Error */}
      {err && (
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: '#ff5555', padding: '0 12px 6px', margin: 0 }}>
          {err}
        </p>
      )}

      {/* Actions */}
      <div style={{ padding: '8px 12px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {toast ? (
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, color: '#22c55e' }}>
            ✓ {toast}
          </span>
        ) : confirming ? (
          <div>
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)', margin: '0 0 8px' }}>
              Buy <strong style={{ color: 'var(--db-text-primary)', fontWeight: 600 }}>{item.name}</strong> for <strong style={{ color: '#ff6b35' }}>{price} ◈</strong>?
            </p>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                onClick={handleConfirmPurchase}
                style={{ flex: 1, background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, padding: '6px 0', cursor: 'pointer' }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                style={{ flex: 1, background: 'none', color: 'var(--db-text-ghost)', border: '1px solid var(--db-border-default)', borderRadius: 6, fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, padding: '6px 0', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Supporter-only: show link to contribute page */}
            {!owned && isSupporterOnly && (
              <a
                href="/contribute"
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  width: '100%', background: 'rgba(255,107,53,0.08)', color: '#ff6b35',
                  border: '1px solid rgba(255,107,53,0.25)', borderRadius: 6,
                  fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600,
                  padding: '7px 0', textDecoration: 'none', transition: 'background 100ms ease',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.15)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.08)' }}
              >
                <DobberBallIcon size={12} />
                Support Dobber
              </a>
            )}

            {/* Purchase row */}
            {!owned && !isFree && !isSupporterOnly && (
              <button
                type="button"
                onClick={!canBuy ? onVerifyNeeded : handleBuyClick}
                disabled={canBuy && (purchasing || !canAfford)}
                style={{
                  width: '100%',
                  background: !canBuy
                    ? 'var(--db-border-subtle)'
                    : canAfford
                      ? 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)'
                      : 'var(--db-border-subtle)',
                  color: !canBuy
                    ? 'var(--db-text-ghost)'
                    : canAfford ? '#fff' : 'var(--db-text-ghost)',
                  border: (!canBuy || !canAfford) ? '1px solid var(--db-border-subtle)' : 'none',
                  borderRadius: 6,
                  fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600,
                  padding: '7px 0',
                  cursor: (!canBuy || !canAfford || purchasing) ? 'not-allowed' : 'pointer',
                  transition: 'opacity 100ms ease',
                  boxShadow: (canBuy && canAfford && !purchasing) ? '0 2px 10px rgba(255,107,53,0.3)' : 'none',
                }}
                onMouseEnter={(e) => { if (canBuy && canAfford && !purchasing) e.currentTarget.style.opacity = '0.9' }}
                onMouseLeave={(e) => { if (canBuy && canAfford && !purchasing) e.currentTarget.style.opacity = '1' }}
                title={!canBuy ? 'Verify your email to unlock purchases' : !canAfford ? `Need ${price} Dobs (have ${dobsBalance ?? 0})` : undefined}
              >
                {purchasing ? '…' : !canBuy ? '🔒 Verify to buy' : `◈ ${price}`}
              </button>
            )}

            {(owned || isFree) && item.category === 'chat_emote' ? (
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, color: '#22c55e' }}>
                ✓ Use in chat
              </span>
            ) : (owned || isFree) ? (
              <>
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: isFree ? 'var(--db-text-ghost)' : 'var(--db-text-ghost)' }}>
                  {isFree ? 'Free' : 'Owned ✓'}
                </span>

                {/* Equip row */}
                {equipped ? (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, color: '#ff6b35' }}>
                      Equipped ✓
                    </span>
                    {item.category === 'badge' && (
                      <button
                        type="button"
                        onClick={handleUnequip}
                        disabled={equipping}
                        style={{ background: 'none', color: 'var(--db-text-ghost)', border: '1px solid var(--db-border-subtle)', borderRadius: 6, fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, padding: '3px 9px', cursor: 'pointer' }}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={doEquip}
                    disabled={equipping}
                    style={{ width: '100%', background: 'var(--db-border-subtle)', color: 'var(--db-text-muted)', border: '1px solid var(--db-border-subtle)', borderRadius: 6, fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, padding: '6px 0', cursor: equipping ? 'wait' : 'pointer', transition: 'all 100ms ease' }}
                    onMouseEnter={(e) => { if (!equipping) { e.currentTarget.style.borderColor = 'rgba(255,107,53,0.4)'; e.currentTarget.style.color = '#ff6b35'; e.currentTarget.style.background = 'rgba(255,107,53,0.08)' } }}
                    onMouseLeave={(e) => { if (!equipping) { e.currentTarget.style.borderColor = 'var(--db-border-subtle)'; e.currentTarget.style.color = 'var(--db-text-muted)'; e.currentTarget.style.background = 'var(--db-border-subtle)' } }}
                  >
                    {equipping ? '…' : 'Equip'}
                  </button>
                )}
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}
