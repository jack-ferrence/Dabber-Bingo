import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useProfile } from '../hooks/useProfile.js'

const TABS = [
  { key: 'all',        label: 'ALL' },
  { key: 'name_color', label: 'COLORS' },
  { key: 'name_font',  label: 'FONTS' },
  { key: 'badge',      label: 'BADGES' },
  { key: 'board_skin', label: 'BOARD SKINS' },
]

function ColorPreview({ value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64 }}>
      <span style={{ width: 40, height: 40, borderRadius: '50%', background: value, display: 'block', boxShadow: `0 0 12px ${value}55` }} />
    </div>
  )
}

function FontPreview({ value }) {
  const fontMap = { mono: 'monospace', display: 'sans-serif', serif: 'serif', rounded: 'sans-serif', default: 'var(--db-font-mono)' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64 }}>
      <span style={{ fontFamily: fontMap[value] ?? 'var(--db-font-mono)', fontSize: 20, fontWeight: 700, color: '#e0e0f0', letterSpacing: '0.1em' }}>
        Dabber
      </span>
    </div>
  )
}

function BadgePreview({ value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64, fontSize: 36 }}>
      {value}
    </div>
  )
}

function SkinPreview({ value }) {
  const skinStyles = {
    neon:    { border: '1px solid #00e5ff', background: '#001a1f' },
    stealth: { border: '1px solid #3a3a55', background: '#0a0a12' },
    inferno: { border: '1px solid #e05520', background: '#1a0800' },
  }
  const markedStyles = {
    neon:    { background: '#001a1f', border: '1px solid #00e5ff', boxShadow: '0 0 6px rgba(0,229,255,0.4)' },
    stealth: { background: '#0a0a12', border: '1px solid #8b5cf6', boxShadow: '0 0 6px rgba(139,92,246,0.4)' },
    inferno: { background: '#3a1000', border: '1px solid #e05520', boxShadow: '0 0 6px rgba(224,85,32,0.3)' },
  }
  const base = skinStyles[value] ?? { border: '1px solid #2a2a44', background: '#1a1a2e' }
  const marked = markedStyles[value] ?? { background: '#2a1a10', border: '1px solid #ff6b35' }
  const cells = [0,1,2,3,4,5,6,7,8]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 18px)', gap: 2 }}>
        {cells.map((i) => (
          <div key={i} style={{ width: 18, height: 18, borderRadius: 2, ...(i % 3 === 1 ? marked : base) }} />
        ))}
      </div>
    </div>
  )
}

function CardSwapPreview() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 64 }}>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 32, color: '#ff6b35' }}>◈</span>
    </div>
  )
}

function ItemPreview({ item }) {
  switch (item.category) {
    case 'name_color': return <ColorPreview value={item.value} />
    case 'name_font':  return <FontPreview  value={item.value} />
    case 'badge':      return <BadgePreview value={item.value} />
    case 'board_skin': return <SkinPreview  value={item.value} />
    case 'card_swap':  return <CardSwapPreview />
    default:           return null
  }
}

function ItemCard({ item, owned, active, dabsBalance, onPurchase }) {
  const [confirming, setConfirming] = useState(false)
  const [purchasing, setPurchasing] = useState(false)
  const [toast, setToast] = useState(null)
  const [err, setErr] = useState('')

  const canAfford = dabsBalance !== null && dabsBalance >= item.cost

  const handleBuyClick = () => {
    setErr('')
    setConfirming(true)
  }

  const handleConfirm = async () => {
    setConfirming(false)
    setPurchasing(true)
    setErr('')

    const { data, error } = await supabase.rpc('purchase_item', { p_item_id: item.id })
    setPurchasing(false)

    if (error) {
      setErr(error.message)
      return
    }
    if (data?.note === 'already_owned') {
      setToast('Already owned')
    } else {
      setToast('Purchased!')
      onPurchase(item, data)
    }

    setTimeout(() => setToast(null), 2200)
  }

  const handleCancel = () => setConfirming(false)

  return (
    <div
      style={{
        background: '#12121e',
        border: `1px solid ${active ? '#ff6b35' : '#2a2a44'}`,
        borderRadius: 4,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Preview */}
      <div style={{ borderBottom: '1px solid #1a1a2e', padding: '4px 0' }}>
        <ItemPreview item={item} />
      </div>

      {/* Info */}
      <div style={{ padding: '10px 12px', flex: 1 }}>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#e0e0f0', marginBottom: 3 }}>
          {item.label}
        </p>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {item.category.replace('_', ' ')}
        </p>
      </div>

      {/* Error */}
      {err && (
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#ff2d2d', padding: '0 12px 6px' }}>
          {err}
        </p>
      )}

      {/* Actions */}
      <div style={{ padding: '8px 12px 12px' }}>
        {toast ? (
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: '#ff6b35' }}>
            {toast}
          </span>
        ) : confirming ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={handleConfirm}
              style={{ flex: 1, background: '#ff6b35', color: '#0c0c14', border: 'none', borderRadius: 3, fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '5px 0', cursor: 'pointer' }}
            >
              CONFIRM
            </button>
            <button
              type="button"
              onClick={handleCancel}
              style={{ flex: 1, background: 'none', color: '#555577', border: '1px solid #2a2a44', borderRadius: 3, fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 600, padding: '5px 0', cursor: 'pointer' }}
            >
              CANCEL
            </button>
          </div>
        ) : active ? (
          <span
            style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#ff6b35', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            ✓ ACTIVE
          </span>
        ) : owned ? (
          <span
            style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, color: '#22c55e', letterSpacing: '0.08em', textTransform: 'uppercase' }}
          >
            ✓ OWNED
          </span>
        ) : (
          <button
            type="button"
            onClick={handleBuyClick}
            disabled={purchasing || !canAfford}
            style={{
              width: '100%',
              background: canAfford ? '#ff6b35' : '#1a1a2e',
              color: canAfford ? '#0c0c14' : '#3a3a55',
              border: 'none', borderRadius: 3,
              fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
              letterSpacing: '0.06em', padding: '6px 0', cursor: canAfford ? 'pointer' : 'not-allowed',
              transition: 'background 100ms ease',
            }}
            onMouseEnter={(e) => { if (canAfford) e.currentTarget.style.background = '#ff8855' }}
            onMouseLeave={(e) => { if (canAfford) e.currentTarget.style.background = '#ff6b35' }}
            title={!canAfford ? `Need ${item.cost} Dabs (you have ${dabsBalance ?? 0})` : undefined}
          >
            {purchasing ? '...' : `◈ ${item.cost}`}
          </button>
        )}
      </div>
    </div>
  )
}

export default function StorePage() {
  const { dabsBalance, nameColor, nameFont, cosmetics, equipped } = useProfile()
  const [items, setItems] = useState([])
  const [tab, setTab] = useState('all')
  // Local override for owned items after purchase (before realtime arrives)
  const [localOwned, setLocalOwned] = useState(new Set())

  useEffect(() => {
    supabase
      .from('store_items')
      .select('*')
      .order('sort_order')
      .then(({ data }) => setItems(data ?? []))
  }, [])

  const ownedIds = useMemo(() => {
    const set = new Set(localOwned)
    // Colors: owned if it's the active name_color (only one active at a time)
    for (const item of items) {
      if (item.category === 'name_color' && item.value === nameColor) set.add(item.id)
      if (item.category === 'name_font'  && item.value === nameFont)  set.add(item.id)
    }
    for (const id of cosmetics?.badges      ?? []) set.add(id)
    for (const id of cosmetics?.board_skins ?? []) set.add(id)
    return set
  }, [items, nameColor, nameFont, cosmetics, localOwned])

  const isActive = useCallback((item) => {
    if (item.category === 'name_color') return nameColor === item.value
    if (item.category === 'name_font')  return nameFont  === item.value
    if (item.category === 'badge')      return equipped?.badge      === item.value
    if (item.category === 'board_skin') return equipped?.board_skin === item.value
    return false
  }, [nameColor, nameFont, equipped])

  const handlePurchase = (item) => {
    setLocalOwned((prev) => new Set([...prev, item.id]))
  }

  const filtered = tab === 'all' ? items : items.filter((i) => i.category === tab)

  return (
    <div style={{ minHeight: '100%', background: '#0c0c14', padding: '32px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
          <h1
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 'clamp(28px, 4vw, 42px)',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#ff6b35',
              lineHeight: 1,
            }}
          >
            DABS STORE
          </h1>
          {dabsBalance !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 4, padding: '6px 12px' }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 18, fontWeight: 900, color: '#ff6b35' }}>
                {dabsBalance.toLocaleString()}
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', letterSpacing: '0.1em' }}>DABS</span>
            </div>
          )}
        </div>

        {/* Tab strip */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 24, flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                background: tab === t.key ? '#ff6b35' : '#1a1a2e',
                color: tab === t.key ? '#0c0c14' : '#555577',
                border: `1px solid ${tab === t.key ? '#ff6b35' : '#2a2a44'}`,
                borderRadius: 4,
                fontFamily: 'var(--db-font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '5px 12px',
                cursor: 'pointer',
                transition: 'all 100ms ease',
              }}
              onMouseEnter={(e) => { if (tab !== t.key) { e.currentTarget.style.borderColor = '#3a3a55'; e.currentTarget.style.color = '#8888aa' } }}
              onMouseLeave={(e) => { if (tab !== t.key) { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#555577' } }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577' }}>Loading...</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
              gap: 12,
            }}
          >
            {filtered.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                owned={ownedIds.has(item.id)}
                active={isActive(item)}
                dabsBalance={dabsBalance}
                onPurchase={handlePurchase}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
