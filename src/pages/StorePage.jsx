import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.js'
import StoreItemCard from '../components/store/StoreItemCard.jsx'
import CategoryTabs from '../components/store/CategoryTabs.jsx'
import VerifyEmailModal from '../components/store/VerifyEmailModal.jsx'

const TABS = [
  { key: 'name_color', label: 'COLORS' },
  { key: 'name_font',  label: 'FONTS' },
  { key: 'badge',      label: 'BADGES' },
  { key: 'board_skin', label: 'BOARD SKINS' },
  { key: 'chat_emote', label: 'EMOTES' },
]

export default function StorePage() {
  const { user } = useAuth()
  const { dobsBalance, nameColor, nameFont, equippedBadge, boardSkin } = useProfile()
  const [searchParams] = useSearchParams()

  const isEmailVerified = user?.email_confirmed_at != null

  const [items, setItems] = useState([])
  const [inventory, setInventory] = useState(new Set())
  // Local equip overrides — tracks what we optimistically equipped this session
  const [localEquipped, setLocalEquipped] = useState({})
  const [tab, setTab] = useState(() => searchParams.get('tab') || 'name_color')
  const [loading, setLoading] = useState(true)
  const [showVerifyModal, setShowVerifyModal] = useState(false)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      const [{ data: storeData }, { data: invData }] = await Promise.all([
        supabase.from('store_items').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('user_inventory').select('item_id').eq('user_id', user.id),
      ])
      setItems(storeData ?? [])
      setInventory(new Set((invData ?? []).map((r) => r.item_id)))
      setLoading(false)
    }
    load()
  }, [user])

  const isOwned = useCallback((item) => {
    const price = item.price ?? item.cost ?? 0
    if (price === 0) return true
    return inventory.has(item.id)
  }, [inventory])

  const isEquipped = useCallback((item) => {
    // Local override takes precedence (optimistic update after equip action)
    if (item.category in localEquipped) {
      return localEquipped[item.category] === item.id
    }
    // Fall back to profile data from DB
    if (item.category === 'name_color') return nameColor  === item.metadata?.hex
    if (item.category === 'name_font')  return nameFont   === item.metadata?.font
    if (item.category === 'badge')      return equippedBadge === item.id
    if (item.category === 'board_skin') return boardSkin  === item.metadata?.class
    return false
  }, [localEquipped, nameColor, nameFont, equippedBadge, boardSkin])

  const handlePurchased = useCallback((item) => {
    setInventory((prev) => new Set([...prev, item.id]))
  }, [])

  const handleEquipped = useCallback((item, category) => {
    if (item === null) {
      // Unequipped (badge)
      setLocalEquipped((prev) => ({ ...prev, [category]: null }))
    } else {
      setLocalEquipped((prev) => ({ ...prev, [item.category]: item.id }))
    }
  }, [])

  const filtered = useMemo(() => {
    return items.filter((i) => i.category === tab)
  }, [items, tab])

  return (
    <div style={{ minHeight: '100%', background: '#0c0c14', padding: '32px 24px' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 'clamp(28px, 4vw, 42px)',
              fontWeight: 800,
              letterSpacing: '0.08em',
              color: '#ff6b35',
              lineHeight: 1,
              margin: 0,
            }}
          >
            DOBS STORE
          </h1>
          {dobsBalance !== null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 4, padding: '6px 14px' }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 20, fontWeight: 900, color: '#ff6b35' }}>
                {dobsBalance.toLocaleString()}
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', letterSpacing: '0.12em' }}>◈ DOBS</span>
            </div>
          )}
        </div>

        {/* Email verification banner */}
        {!isEmailVerified && (
          <div
            style={{
              background: 'rgba(255,107,53,0.08)',
              border: '1px solid rgba(255,107,53,0.25)',
              borderRadius: 6,
              padding: '14px 18px',
              marginBottom: 24,
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div>
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 800, color: '#ff6b35', letterSpacing: '0.08em', margin: '0 0 3px' }}>
                VERIFY YOUR EMAIL TO UNLOCK PURCHASES
              </p>
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#8888aa', margin: 0 }}>
                Check your inbox or click to resend the confirmation email.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowVerifyModal(true)}
              style={{
                background: 'none',
                border: '1px solid rgba(255,107,53,0.4)',
                borderRadius: 4,
                fontFamily: 'var(--db-font-mono)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.06em',
                color: '#ff6b35',
                padding: '5px 14px',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 100ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.12)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
            >
              RESEND VERIFICATION EMAIL
            </button>
          </div>
        )}

        <CategoryTabs tabs={TABS} activeTab={tab} onTabChange={setTab} />

        {loading ? (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577' }}>Loading store...</p>
        ) : filtered.length === 0 ? (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577' }}>No items available.</p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
              gap: 16,
            }}
          >
            {filtered.map((item) => (
              <StoreItemCard
                key={item.id}
                item={item}
                owned={isOwned(item)}
                equipped={isEquipped(item)}
                dobsBalance={dobsBalance}
                isEmailVerified={isEmailVerified}
                onPurchased={handlePurchased}
                onEquipped={handleEquipped}
                onVerifyNeeded={() => setShowVerifyModal(true)}
              />
            ))}
          </div>
        )}
      </div>

      {showVerifyModal && (
        <VerifyEmailModal email={user?.email} onClose={() => setShowVerifyModal(false)} />
      )}
    </div>
  )
}
