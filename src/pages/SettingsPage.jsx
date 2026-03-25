import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useProfile } from '../hooks/useProfile.js'
import { getFontFamily, getBadge } from '../lib/fontMap'
import DaubOverlay from '../components/game/DaubOverlay.jsx'

// ── localStorage helpers ──────────────────────────────────────────────────────
function getPref(key, defaultVal) {
  try { return JSON.parse(localStorage.getItem(`dobber_pref_${key}`)) ?? defaultVal }
  catch { return defaultVal }
}
function setPref(key, val) {
  localStorage.setItem(`dobber_pref_${key}`, JSON.stringify(val))
}

// ── Tab constants ─────────────────────────────────────────────────────────────
const TABS = [
  { key: 'profile',     label: 'PROFILE' },
  { key: 'customize',   label: 'CUSTOMIZE' },
  { key: 'preferences', label: 'PREFERENCES' },
]

// ── Shared sub-components ─────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <p style={{
      fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700,
      letterSpacing: '0.10em', color: '#555577', textTransform: 'uppercase',
      marginBottom: 12, marginTop: 0,
    }}>
      {children}
    </p>
  )
}

function InfoRow({ label, children }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid #1a1a2e',
    }}>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>{label}</span>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#e0e0f0', fontWeight: 700 }}>{children}</span>
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
          : { background: '#0c0c14', border: '1px solid #2a2a44', backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(255,255,255,0.02) 1px,rgba(255,255,255,0.02) 2px)' }
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
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 18px)', gap: 3 }}>
      {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <div key={i} style={{ width: 18, height: 18, borderRadius: 2, ...cellStyle(i) }} />
      ))}
    </div>
  )
}

function Toggle({ value, onChange, disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => !disabled && onChange(!value)}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: value ? '#ff6b35' : '#2a2a44',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', flexShrink: 0,
        transition: 'background 200ms ease',
        opacity: disabled ? 0.4 : 1,
        padding: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: value ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%', background: '#fff',
        transition: 'left 200ms ease',
        display: 'block',
      }} />
    </button>
  )
}

// ── PROFILE TAB ───────────────────────────────────────────────────────────────

function ProfileTab() {
  const { user } = useAuth()
  const { dobsBalance: dabsBalance, username } = useProfile()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ gamesPlayed: null, totalLines: null, totalSquares: null })
  const [txns, setTxns] = useState([])
  const [showTxns, setShowTxns] = useState(false)
  const [txnsLoaded, setTxnsLoaded] = useState(false)
  const [passwordMsg, setPasswordMsg] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [resendMsg, setResendMsg] = useState('')

  useEffect(() => {
    if (!user) return
    const loadStats = async () => {
      const [
        { count: gamesPlayed },
        { data: cardStats },
      ] = await Promise.all([
        supabase.from('room_participants').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('cards').select('lines_completed, squares_marked').eq('user_id', user.id),
      ])
      const totalLines = cardStats?.reduce((sum, c) => sum + (c.lines_completed ?? 0), 0) ?? 0
      const totalSquares = cardStats?.reduce((sum, c) => sum + (c.squares_marked ?? 0), 0) ?? 0
      setStats({ gamesPlayed: gamesPlayed ?? 0, totalLines, totalSquares })
    }
    loadStats()
  }, [user?.id])

  const loadTxns = async () => {
    if (txnsLoaded) { setShowTxns(true); return }
    const { data } = await supabase
      .from('dabs_transactions')
      .select('amount, reason, created_at, room_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    setTxns(data ?? [])
    setTxnsLoaded(true)
    setShowTxns(true)
  }

  const reasonLabel = (reason) => {
    if (!reason) return 'Unknown'
    if (reason.startsWith('store_purchase')) return 'Store Purchase'
    const map = {
      entry_fee: 'Entry Fee',
      participation: 'Participation',
      squares_marked: 'Squares Bonus',
      lines_completed: 'Lines Bonus',
      finish_1: '1st Place',
      finish_2: '2nd Place',
      finish_3: '3rd Place',
      card_swap: 'Card Swap',
      odds_refund: 'Refund',
      bonus: 'Bonus',
    }
    return map[reason] ?? reason
  }

  const formatDate = (iso) => {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
  }

  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '—'

  const isVerified = !!user?.email_confirmed_at

  const handleResend = async () => {
    const { error } = await supabase.auth.resend({ type: 'signup', email: user.email })
    setResendMsg(error ? 'Failed to send' : 'Email sent!')
    setTimeout(() => setResendMsg(''), 4000)
  }

  const handleChangePassword = async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email)
    setPasswordMsg(error ? 'Failed to send' : 'Password reset email sent!')
    setTimeout(() => setPasswordMsg(''), 4000)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const statCards = [
    { label: 'DOBS BALANCE', value: dabsBalance !== null ? dabsBalance.toLocaleString() + ' ◈' : '—', accent: true },
    { label: 'GAMES PLAYED', value: stats.gamesPlayed !== null ? stats.gamesPlayed : '—' },
    { label: 'TOTAL LINES', value: stats.totalLines !== null ? stats.totalLines : '—' },
    { label: 'SQUARES MARKED', value: stats.totalSquares !== null ? stats.totalSquares : '—' },
  ]

  const ghostBtnStyle = {
    background: 'none', border: '1px solid #2a2a44', borderRadius: 4,
    fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
    color: '#8888aa', letterSpacing: '0.06em', padding: '8px 16px', cursor: 'pointer',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Account Info */}
      <div>
        <SectionLabel>Account</SectionLabel>
        <InfoRow label="Username">{username ?? '—'}</InfoRow>
        <InfoRow label="Email"><span style={{ color: '#8888aa' }}>{user?.email ?? '—'}</span></InfoRow>
        <InfoRow label="Verified">
          {isVerified ? (
            <span style={{ color: '#22c55e' }}>✓ Verified</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: '#ff2d2d' }}>✕ Not verified</span>
              <button
                type="button"
                onClick={handleResend}
                style={{
                  background: 'none', border: '1px solid #2a2a44', borderRadius: 3,
                  fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#8888aa',
                  padding: '2px 8px', cursor: 'pointer',
                }}
              >
                {resendMsg || 'Resend'}
              </button>
            </span>
          )}
        </InfoRow>
        <InfoRow label="Member since">{memberSince}</InfoRow>
      </div>

      {/* Stats */}
      <div>
        <SectionLabel>Stats</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {statCards.map((sc) => (
            <div key={sc.label} style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 6, padding: 14 }}>
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', letterSpacing: '0.08em', margin: '0 0 6px' }}>
                {sc.label}
              </p>
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 20, fontWeight: 800, color: sc.accent ? '#ff6b35' : '#e0e0f0', margin: 0 }}>
                {sc.value}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Transaction History */}
      <div>
        <button
          type="button"
          onClick={showTxns ? () => setShowTxns(false) : loadTxns}
          style={{ ...ghostBtnStyle, textTransform: 'uppercase' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a3a55'; e.currentTarget.style.color = '#e0e0f0' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#8888aa' }}
        >
          {showTxns ? 'HIDE TRANSACTION HISTORY' : 'VIEW TRANSACTION HISTORY'}
        </button>
        {showTxns && (
          <div style={{ marginTop: 12 }}>
            {txns.length === 0 ? (
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577' }}>No transactions yet.</p>
            ) : txns.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 0', borderBottom: '1px solid #1a1a2e',
                }}
              >
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', minWidth: 80 }}>
                  {formatDate(t.created_at)}
                </span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', flex: 1, textAlign: 'center' }}>
                  {reasonLabel(t.reason)}
                </span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: t.amount >= 0 ? '#22c55e' : '#ff2d2d' }}>
                  {t.amount >= 0 ? `+${t.amount}` : t.amount}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Account Actions */}
      <div>
        <SectionLabel>Account Actions</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <button
              type="button"
              onClick={handleChangePassword}
              style={ghostBtnStyle}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#3a3a55'; e.currentTarget.style.color = '#e0e0f0' }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#8888aa' }}
            >
              Change Password
            </button>
            {passwordMsg && (
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#22c55e', marginTop: 6, marginBottom: 0 }}>
                {passwordMsg}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            style={ghostBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ff2d2d'; e.currentTarget.style.color = '#ff2d2d' }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#8888aa' }}
          >
            Sign Out
          </button>
          <div>
            {!showDelete ? (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                style={{ background: 'none', border: 'none', fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', cursor: 'pointer', padding: 0 }}
                onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d2d' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
              >
                Delete Account
              </button>
            ) : (
              <div style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 6, padding: 14 }}>
                <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', marginBottom: 10, marginTop: 0 }}>
                  Contact support to delete your account.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDelete(false)}
                  style={{ background: 'none', border: '1px solid #2a2a44', borderRadius: 3, fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', padding: '4px 12px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── CUSTOMIZE TAB ─────────────────────────────────────────────────────────────

function CustomizeTab() {
  const { user } = useAuth()
  const { nameColor, nameFont, equippedBadge, boardSkin, daubStyle, username } = useProfile()

  const [previewColor, setPreviewColor] = useState(nameColor)
  const [previewFont, setPreviewFont] = useState(nameFont ?? 'default')
  const [previewBadge, setPreviewBadge] = useState(equippedBadge)
  const [previewSkin, setPreviewSkin] = useState(boardSkin ?? 'default')
  const [previewDaub, setPreviewDaub] = useState(daubStyle ?? 'classic')

  const [storeItems, setStoreItems] = useState([])
  const [inventory, setInventory] = useState(new Set())
  const [loadingItems, setLoadingItems] = useState(true)
  const [resetMsg, setResetMsg] = useState('')

  useEffect(() => { setPreviewColor(nameColor) }, [nameColor])
  useEffect(() => { setPreviewFont(nameFont ?? 'default') }, [nameFont])
  useEffect(() => { setPreviewBadge(equippedBadge) }, [equippedBadge])
  useEffect(() => { setPreviewSkin(boardSkin ?? 'default') }, [boardSkin])
  useEffect(() => { setPreviewDaub(daubStyle ?? 'classic') }, [daubStyle])

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const [{ data: items }, { data: inv }] = await Promise.all([
        supabase.from('store_items').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('user_inventory').select('item_id').eq('user_id', user.id),
      ])
      setStoreItems(items ?? [])
      setInventory(new Set(inv?.map((r) => r.item_id) ?? []))
      setLoadingItems(false)
    }
    load()
  }, [user?.id])

  const equip = async (itemId) => {
    const { data, error } = await supabase.rpc('equip_store_item', { p_item_id: itemId })
    if (error || !data?.success) console.error('Equip failed', error ?? data?.reason)
  }

  const handleColorSelect = async (item) => {
    setPreviewColor(item.metadata?.hex ?? null)
    await equip(item.id)
  }

  const handleFontSelect = async (item) => {
    setPreviewFont(item.metadata?.font ?? 'default')
    await equip(item.id)
  }

  const handleBadgeSelect = async (item) => {
    setPreviewBadge(item.id)
    await equip(item.id)
  }

  const handleBadgeUnequip = async () => {
    setPreviewBadge(null)
    await supabase.from('profiles').update({ equipped_badge: null }).eq('id', user.id)
  }

  const handleSkinSelect = async (item) => {
    setPreviewSkin(item.metadata?.class ?? 'default')
    await equip(item.id)
  }

  const handleDaubSelect = async (item) => {
    setPreviewDaub(item.metadata?.style ?? 'classic')
    await equip(item.id)
  }

  const handleDefaultDaubSelect = async () => {
    setPreviewDaub('classic')
    await supabase.from('profiles').update({ daub_style: 'classic' }).eq('id', user.id)
  }

  const handleDefaultColorSelect = async () => {
    setPreviewColor(null)
    await supabase.from('profiles').update({ name_color: null }).eq('id', user.id)
  }

  const handleDefaultFontSelect = async () => {
    setPreviewFont('default')
    await supabase.from('profiles').update({ name_font: 'default' }).eq('id', user.id)
  }

  const handleDefaultSkinSelect = async () => {
    setPreviewSkin('default')
    await supabase.from('profiles').update({ board_skin: 'default' }).eq('id', user.id)
  }

  const handleReset = async () => {
    setPreviewColor(null)
    setPreviewFont('default')
    setPreviewBadge(null)
    setPreviewSkin('default')
    setPreviewDaub('classic')
    await supabase
      .from('profiles')
      .update({ name_color: null, name_font: 'default', equipped_badge: null, board_skin: 'default', daub_style: 'classic' })
      .eq('id', user.id)
    setResetMsg('Reset to defaults!')
    setTimeout(() => setResetMsg(''), 3000)
  }

  const colorItems = storeItems.filter((i) => i.category === 'name_color')
  const fontItems  = storeItems.filter((i) => i.category === 'name_font')
  const badgeItems = storeItems.filter((i) => i.category === 'badge')
  const daubItems  = storeItems.filter((i) => i.category === 'daub_style')
  const skinItems  = storeItems.filter((i) => i.category === 'board_skin')

  const displayName = username ?? 'YourName'
  const badgeInfo = previewBadge ? getBadge(previewBadge) : null

  const swatchBtn = (isEquipped, owned, onClick, style = {}) => ({
    border: isEquipped ? '2px solid #ff6b35' : '2px solid transparent',
    cursor: owned ? 'pointer' : 'default',
    opacity: owned ? 1 : 0.25,
    background: 'none',
    padding: 0,
    ...style,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Live Preview */}
      <div style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 6, padding: 16 }}>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', letterSpacing: '0.10em', marginBottom: 12, marginTop: 0, textTransform: 'uppercase' }}>
          Live Preview
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: '#0c0c14', borderRadius: 4, marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', minWidth: 16 }}>1</span>
          {badgeInfo && <span style={{ fontSize: 14 }}>{badgeInfo.emoji}</span>}
          <span style={{ fontFamily: getFontFamily(previewFont), fontSize: 13, fontWeight: 700, color: previewColor ?? '#e0e0f0', flex: 1 }}>
            {displayName}
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577' }}>0/12 0/25</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SkinPreview skinClass={previewSkin} />
        </div>
      </div>

      {loadingItems ? (
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#555577' }}>Loading...</p>
      ) : (
        <>
          {/* Name Color */}
          <div>
            <SectionLabel>Name Color</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                <button
                  type="button"
                  onClick={handleDefaultColorSelect}
                  title="Default"
                  style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: '#e0e0f0',
                    border: !previewColor ? '2px solid #ff6b35' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577' }}>DEFAULT</span>
              </div>
              {colorItems.map((item) => {
                const owned = inventory.has(item.id)
                const isEquipped = previewColor === item.metadata?.hex
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={owned ? () => handleColorSelect(item) : undefined}
                    title={owned ? item.name : `${item.name} (locked)`}
                    style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: item.metadata?.hex ?? '#e0e0f0',
                      border: isEquipped ? '2px solid #ff6b35' : '2px solid transparent',
                      boxShadow: isEquipped && owned ? `0 0 8px ${item.metadata?.hex}88` : undefined,
                      opacity: owned ? 1 : 0.25,
                      cursor: owned ? 'pointer' : 'default',
                      position: 'relative',
                      padding: 0,
                    }}
                  >
                    {!owned && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9 }}>🔒</span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Name Font */}
          <div>
            <SectionLabel>Name Font</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                onClick={handleDefaultFontSelect}
                style={{
                  background: previewFont === 'default' ? '#1a1a2e' : 'none',
                  border: previewFont === 'default' ? '1px solid #ff6b35' : '1px solid #2a2a44',
                  borderRadius: 4, padding: '6px 12px', cursor: 'pointer',
                  fontFamily: getFontFamily('default'), fontSize: 13, color: '#e0e0f0',
                }}
              >
                Default
              </button>
              {fontItems.map((item) => {
                const owned = inventory.has(item.id)
                const isEquipped = previewFont === item.metadata?.font
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={owned ? () => handleFontSelect(item) : undefined}
                    title={owned ? item.name : `${item.name} (locked)`}
                    style={{
                      background: isEquipped ? '#1a1a2e' : 'none',
                      border: isEquipped ? '1px solid #ff6b35' : '1px solid #2a2a44',
                      borderRadius: 4, padding: '6px 12px',
                      cursor: owned ? 'pointer' : 'default',
                      opacity: owned ? 1 : 0.25,
                      fontFamily: getFontFamily(item.metadata?.font ?? 'default'),
                      fontSize: 13, color: '#e0e0f0',
                    }}
                  >
                    {item.name}
                    {!owned && <span style={{ marginLeft: 4, fontSize: 9 }}>🔒</span>}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Badge */}
          <div>
            <SectionLabel>Badge</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleBadgeUnequip}
                title="Remove badge"
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: !previewBadge ? '#1a1a2e' : '#12121e',
                  border: !previewBadge ? '2px solid #ff6b35' : '2px solid #2a2a44',
                  cursor: 'pointer', fontSize: 14, color: '#555577',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 0,
                }}
              >
                ✕
              </button>
              {badgeItems.map((item) => {
                const owned = inventory.has(item.id)
                const isEquipped = previewBadge === item.id
                const badge = getBadge(item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={owned ? () => handleBadgeSelect(item) : undefined}
                    title={owned ? item.name : `${item.name} (locked)`}
                    style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: isEquipped ? '#1a1a2e' : '#12121e',
                      border: isEquipped ? '2px solid #ff6b35' : '2px solid #2a2a44',
                      cursor: owned ? 'pointer' : 'default',
                      opacity: owned ? 1 : 0.25,
                      fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative', padding: 0,
                    }}
                  >
                    {badge?.emoji ?? '?'}
                    {!owned && (
                      <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, background: 'rgba(12,12,20,0.75)', borderRadius: '50%' }}>
                        🔒
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Daub Style */}
          <div>
            <SectionLabel>Daub Style</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-start' }}>
              {/* Classic — always available */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleDefaultDaubSelect}
                  style={{
                    width: 52, height: 52,
                    background: previewDaub === 'classic' ? '#1a1a2e' : '#12121e',
                    border: previewDaub === 'classic' ? '2px solid #ff6b35' : '1px solid #2a2a44',
                    borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden',
                    padding: 0,
                  }}
                >
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 18, color: '#ff6b35' }}>✓</span>
                </button>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577', textTransform: 'uppercase' }}>Classic</span>
              </div>
              {daubItems.map((item) => {
                const owned = inventory.has(item.id)
                const daubKey = item.metadata?.style ?? 'classic'
                const isEquipped = previewDaub === daubKey
                return (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: owned ? 1 : 0.3 }}>
                    <button
                      type="button"
                      onClick={owned ? () => handleDaubSelect(item) : undefined}
                      title={owned ? item.name : `${item.name} (locked)`}
                      style={{
                        width: 52, height: 52,
                        background: isEquipped ? '#2a1a10' : '#12121e',
                        border: isEquipped ? '2px solid #ff6b35' : '1px solid #2a2a44',
                        borderRadius: 6,
                        cursor: owned ? 'pointer' : 'default',
                        position: 'relative', overflow: 'hidden',
                        padding: 0,
                      }}
                    >
                      {/* Mini marked square preview */}
                      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                        <DaubOverlay style={daubKey} animated={false} />
                      </div>
                      {!owned && (
                        <span style={{ position: 'absolute', top: 3, right: 3, fontSize: 9 }}>🔒</span>
                      )}
                    </button>
                    <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577', textTransform: 'uppercase' }}>
                      {item.name}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Board Skin */}
          <div>
            <SectionLabel>Board Skin</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  onClick={handleDefaultSkinSelect}
                  style={{
                    background: previewSkin === 'default' ? '#1a1a2e' : '#12121e',
                    border: previewSkin === 'default' ? '2px solid #ff6b35' : '1px solid #2a2a44',
                    borderRadius: 6, padding: 8, cursor: 'pointer',
                  }}
                >
                  <SkinPreview skinClass="default" />
                </button>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577', textTransform: 'uppercase' }}>Default</span>
              </div>
              {skinItems.map((item) => {
                const owned = inventory.has(item.id)
                const skinClass = item.metadata?.class ?? 'default'
                const isEquipped = previewSkin === skinClass
                return (
                  <div key={item.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, opacity: owned ? 1 : 0.25 }}>
                    <button
                      type="button"
                      onClick={owned ? () => handleSkinSelect(item) : undefined}
                      style={{
                        background: isEquipped ? '#1a1a2e' : '#12121e',
                        border: isEquipped ? '2px solid #ff6b35' : '1px solid #2a2a44',
                        borderRadius: 6, padding: 8,
                        cursor: owned ? 'pointer' : 'default',
                        position: 'relative',
                      }}
                    >
                      <SkinPreview skinClass={skinClass} />
                      {!owned && (
                        <span style={{ position: 'absolute', top: 3, right: 3, fontSize: 9 }}>🔒</span>
                      )}
                    </button>
                    <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: '#555577', textTransform: 'uppercase' }}>
                      {item.name}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start', paddingTop: 4 }}>
            <button
              type="button"
              onClick={handleReset}
              style={{
                background: 'none', border: '1px solid #2a2a44', borderRadius: 4,
                fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
                color: '#555577', letterSpacing: '0.06em', padding: '7px 16px',
                cursor: 'pointer', textTransform: 'uppercase',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#8888aa'; e.currentTarget.style.borderColor = '#3a3a55' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555577'; e.currentTarget.style.borderColor = '#2a2a44' }}
            >
              Reset to Defaults
            </button>
            {resetMsg && (
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#22c55e', margin: 0 }}>{resetMsg}</p>
            )}
            <Link
              to="/store"
              style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff6b35', textDecoration: 'none', fontWeight: 700 }}
            >
              Want more? Visit the DOBS STORE →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

// ── PREFERENCES TAB ───────────────────────────────────────────────────────────

function PreferencesTab() {
  const navigate = useNavigate()
  const [soundEffects,    setSoundEffects]    = useState(() => getPref('sound_effects', true))
  const [markAnimations,  setMarkAnimations]  = useState(() => getPref('mark_animations', true))
  const [autoScroll,      setAutoScroll]      = useState(() => getPref('auto_scroll_stats', true))
  const [defaultSport,    setDefaultSport]    = useState(() => getPref('default_sport', 'all'))

  const handleToggle = (key, setter) => (val) => {
    setter(val)
    setPref(key, val)
  }

  const handleSportChange = (val) => {
    setDefaultSport(val)
    setPref('default_sport', val)
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  const PrefRow = ({ label, control }) => (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '10px 0', borderBottom: '1px solid #1a1a2e',
    }}>
      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>{label}</span>
      {control}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Game Preferences */}
      <div>
        <SectionLabel>Game Preferences</SectionLabel>
        <PrefRow label="Sound effects" control={<Toggle value={soundEffects} onChange={handleToggle('sound_effects', setSoundEffects)} />} />
        <PrefRow label="Square mark animations" control={<Toggle value={markAnimations} onChange={handleToggle('mark_animations', setMarkAnimations)} />} />
        <PrefRow label="Auto-scroll to latest stat event" control={<Toggle value={autoScroll} onChange={handleToggle('auto_scroll_stats', setAutoScroll)} />} />
      </div>

      {/* Default Sport */}
      <div>
        <SectionLabel>Default Sport</SectionLabel>
        {[
          { val: 'all',  label: 'All Sports' },
          { val: 'nba',  label: 'NBA Only' },
          { val: 'ncaa', label: 'NCAA Only' },
        ].map((opt) => (
          <div
            key={opt.val}
            onClick={() => handleSportChange(opt.val)}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid #1a1a2e', cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>{opt.label}</span>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', display: 'block',
              border: `2px solid ${defaultSport === opt.val ? '#ff6b35' : '#2a2a44'}`,
              background: defaultSport === opt.val ? '#ff6b35' : 'none',
              flexShrink: 0,
            }} />
          </div>
        ))}
      </div>

      {/* Notifications (future) */}
      <div style={{ opacity: 0.4 }}>
        <SectionLabel>Notifications</SectionLabel>
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', marginBottom: 12, marginTop: 0 }}>
          Push notifications coming soon. We'll alert you when games start and when you hit bingo lines.
        </p>
        {['Game start alerts', 'Bingo line alerts', 'Daily game reminders'].map((label) => (
          <div
            key={label}
            style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '10px 0', borderBottom: '1px solid #1a1a2e',
            }}
          >
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>{label}</span>
            <Toggle value={false} onChange={() => {}} disabled />
          </div>
        ))}
      </div>

      {/* About */}
      <div>
        <SectionLabel>About</SectionLabel>
        {[
          { label: 'Version',           right: <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#e0e0f0', fontWeight: 700 }}>0.1.0-beta</span> },
          { label: 'How to Play',       right: <Link to="/"    style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff6b35', textDecoration: 'none' }}>View →</Link> },
          { label: 'Contact Support',   right: <a href="mailto:ferrencesup@gmail.com" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff6b35', textDecoration: 'none' }}>ferrencesup@gmail.com</a> },
          { label: 'Terms of Service',  right: <Link to="/"    style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff6b35', textDecoration: 'none' }}>View →</Link> },
          { label: 'Privacy Policy',    right: <Link to="/"    style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#ff6b35', textDecoration: 'none' }}>View →</Link> },
        ].map(({ label, right }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #1a1a2e' }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: '#8888aa' }}>{label}</span>
            {right}
          </div>
        ))}
      </div>

      {/* Danger Zone */}
      <div>
        <SectionLabel>Account</SectionLabel>
        <button
          type="button"
          onClick={handleSignOut}
          style={{
            background: 'none', border: '1px solid #2a2a44', borderRadius: 4,
            fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
            color: '#8888aa', letterSpacing: '0.06em', padding: '8px 16px', cursor: 'pointer',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#ff2d2d'; e.currentTarget.style.color = '#ff2d2d' }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#2a2a44'; e.currentTarget.style.color = '#8888aa' }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

// ── SETTINGS PAGE ─────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState('profile')

  return (
    <div className="px-4 py-5 md:px-6 md:py-8" style={{ minHeight: '100%', background: '#0c0c14' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <h1 style={{
          fontFamily: 'var(--db-font-display)',
          fontSize: 'clamp(28px, 4vw, 42px)',
          color: '#ff6b35',
          letterSpacing: '0.08em',
          margin: '0 0 24px',
          lineHeight: 1,
        }}>
          SETTINGS
        </h1>

        {/* Tab bar */}
        <div className="scrollbar-hide" style={{ display: 'flex', borderBottom: '1px solid #2a2a44', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                color: tab === t.key ? '#ff6b35' : '#555577',
                padding: '8px 16px', cursor: 'pointer',
                background: 'none', border: 'none',
                borderBottom: tab === t.key ? '2px solid #ff6b35' : '2px solid transparent',
                marginBottom: -1, flexShrink: 0,
              }}
              onMouseEnter={(e) => { if (tab !== t.key) e.currentTarget.style.color = '#8888aa' }}
              onMouseLeave={(e) => { if (tab !== t.key) e.currentTarget.style.color = '#555577' }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div style={{ marginTop: 24 }}>
          {tab === 'profile'     && <ProfileTab />}
          {tab === 'customize'   && <CustomizeTab />}
          {tab === 'preferences' && <PreferencesTab />}
        </div>
      </div>
    </div>
  )
}
