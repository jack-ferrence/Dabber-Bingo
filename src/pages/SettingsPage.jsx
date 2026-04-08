import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { isIOS, isNative } from '../lib/platform.js'
import { usePushNotifications } from '../hooks/usePushNotifications.js'
import { useProfile } from '../hooks/useProfile.js'
import { getFontFamily, getBadge } from '../lib/fontMap'
import DaubOverlay from '../components/game/DaubOverlay.jsx'
import BadgeEmoji from '../components/ui/BadgeEmoji.jsx'
import DobberBallIcon from '../components/ui/DobberBallIcon.jsx'
import { useTheme } from '../hooks/useTheme.js'

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
      fontFamily: 'var(--db-font-display)', fontSize: 11,
      letterSpacing: '0.1em', color: 'var(--db-text-muted)',
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
      padding: '10px 0', borderBottom: '1px solid var(--db-border-subtle)',
    }}>
      <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--db-text-primary)' }}>{children}</span>
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
          ? { background: '#2a1a10', border: '1px solid var(--db-primary)' }
          : { background: 'var(--db-bg-page)', border: '1px solid var(--db-bg-active)', backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(128,128,128,0.03) 1px,rgba(128,128,128,0.03) 2px)' }
      case 'minimal':
        return isMarked
          ? { background: 'rgba(255,107,53,0.06)', border: '0.5px solid rgba(255,107,53,0.5)', borderRadius: 1 }
          : { background: 'transparent', border: '0.5px solid var(--db-border-default)', borderRadius: 1 }
      case 'gold':
        return isMarked
          ? { background: 'rgba(245,158,11,0.08)', border: '1px solid #f59e0b' }
          : { background: 'var(--db-bg-page)', border: '1px solid rgba(245,158,11,0.25)' }
      default:
        return isMarked
          ? { background: 'rgba(255,107,53,0.12)', border: '1px solid rgba(255,107,53,0.4)' }
          : { background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)' }
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
        background: value ? 'var(--db-primary)' : 'var(--db-bg-active)',
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
  const [phoneVerified, setPhoneVerified] = useState(false)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneInput, setPhoneInput] = useState('')
  const [phoneError, setPhoneError] = useState('')
  const [phoneSubmitting, setPhoneSubmitting] = useState(false)

  useEffect(() => {
    if (!user) return
    const loadStats = async () => {
      const [
        { count: gamesPlayed },
        { data: cardStats },
        { data: profileData },
      ] = await Promise.all([
        supabase.from('room_participants').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
        supabase.from('cards').select('lines_completed, squares_marked').eq('user_id', user.id),
        supabase.from('profiles').select('phone_verified, phone_number').eq('id', user.id).single(),
      ])
      const totalLines = cardStats?.reduce((sum, c) => sum + (c.lines_completed ?? 0), 0) ?? 0
      const totalSquares = cardStats?.reduce((sum, c) => sum + (c.squares_marked ?? 0), 0) ?? 0
      setStats({ gamesPlayed: gamesPlayed ?? 0, totalLines, totalSquares })
      if (profileData) {
        setPhoneVerified(profileData.phone_verified || false)
        setPhoneNumber(profileData.phone_number || '')
      }
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

  const handleSubmitPhone = async () => {
    setPhoneError('')
    const cleaned = phoneInput.replace(/[^0-9+]/g, '')
    if (cleaned.replace(/[^0-9]/g, '').length < 10) {
      setPhoneError('Enter a valid phone number (at least 10 digits)')
      return
    }
    setPhoneSubmitting(true)
    const { data, error } = await supabase.rpc('submit_phone_number', { p_phone: cleaned })
    if (error) { setPhoneError(error.message); setPhoneSubmitting(false); return }
    if (data?.success) { setPhoneVerified(true); setPhoneNumber(data.phone) }
    else { setPhoneError(data?.message || 'Failed') }
    setPhoneSubmitting(false)
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
    background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 8,
    fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600,
    color: 'var(--db-text-muted)', padding: '8px 18px', cursor: 'pointer',
    transition: 'background 120ms ease, color 120ms ease',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
      {/* Account Info */}
      <div>
        <SectionLabel>Account</SectionLabel>
        <InfoRow label="Username">{username ?? '—'}</InfoRow>
        <InfoRow label="Email"><span style={{ color: 'var(--db-text-secondary)' }}>{user?.email ?? '—'}</span></InfoRow>
        <InfoRow label="Verified">
          {isVerified ? (
            <span style={{ color: 'var(--db-success)', fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 500 }}>✓ Verified</span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-danger)' }}>Not verified</span>
              <button
                type="button"
                onClick={handleResend}
                style={{
                  background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 6,
                  fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--db-text-muted)',
                  padding: '3px 10px', cursor: 'pointer',
                }}
              >
                {resendMsg || 'Resend'}
              </button>
            </span>
          )}
        </InfoRow>
        <InfoRow label="Member since">{memberSince}</InfoRow>
      </div>

      {/* Featured Game Verification */}
      <div>
        <SectionLabel>Featured Game Verification</SectionLabel>
        <div style={{ background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-subtle)', borderRadius: 10, padding: 16, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--db-border-subtle)' }}>
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)' }}>Email</span>
            {isVerified ? (
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--db-success)' }}>✓ Verified</span>
            ) : (
              <button type="button" onClick={handleResend}
                style={{ background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 6, fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--db-text-muted)', padding: '4px 12px', cursor: 'pointer' }}>
                {resendMsg || 'Send verification'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)' }}>Phone</span>
            {phoneVerified ? (
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--db-success)' }}>
                ✓ {phoneNumber}
              </span>
            ) : (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="tel"
                  aria-label="Phone number"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="(555) 123-4567"
                  style={{
                    width: 150, padding: '6px 10px', borderRadius: 6,
                    background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)',
                    fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'var(--db-text-primary)',
                    boxSizing: 'border-box',
                    transition: 'border-color 140ms ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,107,53,0.5)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--db-border-default)' }}
                />
                <button type="button" onClick={handleSubmitPhone} disabled={phoneSubmitting}
                  style={{
                    background: 'rgba(255,107,53,0.1)', border: '1px solid rgba(255,107,53,0.3)', borderRadius: 6,
                    fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--db-primary)',
                    padding: '5px 12px', cursor: 'pointer', opacity: phoneSubmitting ? 0.5 : 1, transition: 'background 120ms ease',
                  }}>
                  {phoneSubmitting ? '…' : 'Add'}
                </button>
              </div>
            )}
          </div>
          {phoneError && (
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'var(--db-danger)', marginTop: 8, marginBottom: 0 }}>{phoneError}</p>
          )}
        </div>
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)', margin: 0, lineHeight: 1.5 }}>
          Both required to enter featured games with prizes. Each phone number can only be linked to one account.
        </p>
      </div>

      {/* Stats */}
      <div>
        <SectionLabel>Stats</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          {statCards.map((sc) => (
            <div key={sc.label} style={{ background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)', borderRadius: 10, padding: 14 }}>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 500, letterSpacing: '0.06em', color: 'var(--db-text-ghost)', textTransform: 'uppercase', margin: '0 0 6px' }}>
                {sc.label}
              </p>
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 22, fontWeight: 700, color: sc.accent ? 'var(--db-primary)' : 'var(--db-text-primary)', margin: 0, fontVariantNumeric: 'tabular-nums' }}>
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
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
        >
          {showTxns ? 'Hide transaction history' : 'View transaction history'}
        </button>
        {showTxns && (
          <div style={{ marginTop: 12 }}>
            {txns.length === 0 ? (
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)' }}>No transactions yet.</p>
            ) : txns.map((t, i) => (
              <div
                key={i}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '9px 0', borderBottom: '1px solid var(--db-border-subtle)',
                }}
              >
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)', minWidth: 80 }}>
                  {formatDate(t.created_at)}
                </span>
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'var(--db-text-secondary)', flex: 1, textAlign: 'center' }}>
                  {reasonLabel(t.reason)}
                </span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: t.amount >= 0 ? 'var(--db-success)' : 'var(--db-danger)', fontVariantNumeric: 'tabular-nums' }}>
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
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
            >
              Change Password
            </button>
            {passwordMsg && (
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-success)', marginTop: 6, marginBottom: 0 }}>
                {passwordMsg}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            style={ghostBtnStyle}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,45,45,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,45,45,0.3)'; e.currentTarget.style.color = 'var(--db-danger)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.borderColor = 'var(--db-border-default)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
          >
            Sign Out
          </button>
          <div>
            {!showDelete ? (
              <button
                type="button"
                onClick={() => setShowDelete(true)}
                style={{ background: 'none', border: 'none', fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)', cursor: 'pointer', padding: 0, transition: 'color 120ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-danger)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-muted)' }}
              >
                Delete Account
              </button>
            ) : (
              <div style={{ background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-subtle)', borderRadius: 8, padding: 14 }}>
                <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'var(--db-text-muted)', marginBottom: 10, marginTop: 0 }}>
                  Contact support to delete your account.
                </p>
                <button
                  type="button"
                  onClick={() => setShowDelete(false)}
                  style={{ background: 'none', border: '1px solid var(--db-border-default)', borderRadius: 6, fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--db-text-ghost)', padding: '10px 14px', cursor: 'pointer' }}
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
    border: isEquipped ? '2px solid var(--db-primary)' : '2px solid transparent',
    cursor: owned ? 'pointer' : 'default',
    opacity: owned ? 1 : 0.25,
    background: 'none',
    padding: 0,
    ...style,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Live Preview */}
      <div style={{ background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-subtle)', borderRadius: 10, padding: 16 }}>
        <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, letterSpacing: '0.12em', color: 'var(--db-text-muted)', marginBottom: 12, marginTop: 0 }}>
          LIVE PREVIEW
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--db-bg-elevated)', borderRadius: 6, marginBottom: 12 }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-muted)', minWidth: 16 }}>1</span>
          {badgeInfo && <BadgeEmoji emoji={badgeInfo.emoji} size={14} />}
          <span style={{ fontFamily: getFontFamily(previewFont), fontSize: 13, fontWeight: 700, color: previewColor ?? 'var(--db-text-primary)', flex: 1 }}>
            {displayName}
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-muted)', fontVariantNumeric: 'tabular-nums' }}>0/12 0/25</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <SkinPreview skinClass={previewSkin} />
        </div>
      </div>

      {loadingItems ? (
        <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)' }}>Loading...</p>
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
                    background: 'var(--db-text-primary)',
                    border: !previewColor ? '2px solid var(--db-primary)' : '2px solid transparent',
                    cursor: 'pointer',
                  }}
                />
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, color: 'var(--db-text-ghost)', textTransform: 'uppercase' }}>Default</span>
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
                      background: item.metadata?.hex ?? 'var(--db-text-primary)',
                      border: isEquipped ? '2px solid var(--db-primary)' : '2px solid transparent',
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
                  background: previewFont === 'default' ? 'rgba(255,107,53,0.08)' : 'none',
                  border: previewFont === 'default' ? '1px solid var(--db-primary)' : '1px solid var(--db-border-default)',
                  borderRadius: 4, padding: '6px 12px', cursor: 'pointer',
                  fontFamily: getFontFamily('default'), fontSize: 13, color: 'var(--db-text-primary)',
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
                      background: isEquipped ? 'rgba(255,107,53,0.08)' : 'none',
                      border: isEquipped ? '1px solid var(--db-primary)' : '1px solid var(--db-border-default)',
                      borderRadius: 4, padding: '6px 12px',
                      cursor: owned ? 'pointer' : 'default',
                      opacity: owned ? 1 : 0.25,
                      fontFamily: getFontFamily(item.metadata?.font ?? 'default'),
                      fontSize: 13, color: 'var(--db-text-primary)',
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
                aria-label="Remove badge"
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: !previewBadge ? 'rgba(255,107,53,0.08)' : 'var(--db-bg-elevated)',
                  border: !previewBadge ? '2px solid var(--db-primary)' : '2px solid var(--db-border-default)',
                  cursor: 'pointer', fontSize: 14, color: 'var(--db-text-ghost)',
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
                      background: isEquipped ? 'rgba(255,107,53,0.08)' : 'var(--db-bg-elevated)',
                      border: isEquipped ? '2px solid var(--db-primary)' : '2px solid var(--db-border-default)',
                      cursor: owned ? 'pointer' : 'default',
                      opacity: owned ? 1 : 0.25,
                      fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      position: 'relative', padding: 0,
                    }}
                  >
                    {badge ? <BadgeEmoji emoji={badge.emoji} size={18} /> : '?'}
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
                    background: previewDaub === 'classic' ? 'rgba(255,107,53,0.08)' : 'var(--db-bg-elevated)',
                    border: previewDaub === 'classic' ? '2px solid var(--db-primary)' : '1px solid var(--db-border-default)',
                    borderRadius: 6, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    position: 'relative', overflow: 'hidden',
                    padding: 0,
                  }}
                >
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 18, color: 'var(--db-primary)' }}>✓</span>
                </button>
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, color: 'var(--db-text-ghost)', textTransform: 'uppercase' }}>Classic</span>
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
                        background: isEquipped ? 'rgba(255,107,53,0.08)' : 'var(--db-bg-elevated)',
                        border: isEquipped ? '2px solid var(--db-primary)' : '1px solid var(--db-border-default)',
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
                    <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, color: 'var(--db-text-ghost)', textTransform: 'uppercase' }}>
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
                    background: previewSkin === 'default' ? 'rgba(255,107,53,0.08)' : 'var(--db-bg-elevated)',
                    border: previewSkin === 'default' ? '2px solid var(--db-primary)' : '1px solid var(--db-border-default)',
                    borderRadius: 6, padding: 8, cursor: 'pointer',
                  }}
                >
                  <SkinPreview skinClass="default" />
                </button>
                <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, color: 'var(--db-text-ghost)', textTransform: 'uppercase' }}>Default</span>
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
                        background: isEquipped ? 'rgba(255,107,53,0.08)' : 'var(--db-bg-elevated)',
                        border: isEquipped ? '2px solid var(--db-primary)' : '1px solid var(--db-border-default)',
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
                    <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 9, color: 'var(--db-text-ghost)', textTransform: 'uppercase' }}>
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
                background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 8,
                fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500,
                color: 'var(--db-text-muted)', padding: '7px 16px',
                cursor: 'pointer', transition: 'background 100ms ease, color 100ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
            >
              Reset to Defaults
            </button>
            {resetMsg && (
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-success)', margin: 0 }}>{resetMsg}</p>
            )}
            <Link
              to="/store"
              style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-primary)', textDecoration: 'none', fontWeight: 700 }}
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
  const { user } = useAuth()
  const { theme: currentTheme, setTheme } = useTheme()
  const { permissionStatus, requestPermission } = usePushNotifications(user)
  const [soundEffects,    setSoundEffects]    = useState(() => getPref('sound_effects', true))
  const [markAnimations,  setMarkAnimations]  = useState(() => getPref('mark_animations', true))
  const [autoScroll,      setAutoScroll]      = useState(() => getPref('auto_scroll_stats', true))
  const [defaultSport,    setDefaultSport]    = useState(() => getPref('default_sport', 'all'))
  const [isAdmin,         setIsAdmin]         = useState(false)

  // Notification prefs (persisted in profiles)
  const [notifyGameStart, setNotifyGameStart] = useState(true)
  const [notifyBingoLine, setNotifyBingoLine] = useState(true)
  const [notifyDaily,     setNotifyDaily]     = useState(false)
  const [notifsLoaded,    setNotifsLoaded]    = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('is_admin, notify_game_start, notify_bingo_line, notify_daily').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.is_admin) setIsAdmin(true)
        if (data) {
          setNotifyGameStart(data.notify_game_start ?? true)
          setNotifyBingoLine(data.notify_bingo_line ?? true)
          setNotifyDaily(data.notify_daily ?? false)
        }
        setNotifsLoaded(true)
      })
  }, [user])

  const handleNotifToggle = async (field, setter, value) => {
    setter(value)
    await supabase.from('profiles').update({ [field]: value }).eq('id', user.id)
  }

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
      padding: '10px 0', borderBottom: '1px solid var(--db-border-subtle)',
    }}>
      <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-secondary)' }}>{label}</span>
      {control}
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* Appearance / Theme — disabled, dark mode only for now */}

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
              padding: '10px 0', borderBottom: '1px solid var(--db-border-subtle)', cursor: 'pointer',
            }}
          >
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-secondary)' }}>{opt.label}</span>
            <span style={{
              width: 16, height: 16, borderRadius: '50%', display: 'block',
              border: `2px solid ${defaultSport === opt.val ? 'var(--db-primary)' : 'var(--db-border-active)'}`,
              background: defaultSport === opt.val ? 'var(--db-primary)' : 'none',
              flexShrink: 0,
            }} />
          </div>
        ))}
      </div>

      {/* Notifications */}
      <div>
        <SectionLabel>Notifications</SectionLabel>
        {isNative() ? (
          permissionStatus === 'denied' ? (
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)', lineHeight: 1.5, margin: '0 0 12px' }}>
              Notifications are turned off. Enable them in your iPhone Settings → Dobber.
            </p>
          ) : permissionStatus === 'granted' ? (
            <>
              <PrefRow label="Game start alerts" control={<Toggle value={notifyGameStart} onChange={(v) => handleNotifToggle('notify_game_start', setNotifyGameStart, v)} />} />
              <PrefRow label="Bingo line alerts" control={<Toggle value={notifyBingoLine} onChange={(v) => handleNotifToggle('notify_bingo_line', setNotifyBingoLine, v)} />} />
              <PrefRow label="Daily game reminders" control={<Toggle value={notifyDaily} onChange={(v) => handleNotifToggle('notify_daily', setNotifyDaily, v)} />} />
            </>
          ) : (
            <button
              type="button"
              onClick={requestPermission}
              style={{
                width: '100%', padding: '12px 0', borderRadius: 8, border: 'none',
                background: 'var(--db-gradient-primary)',
                fontFamily: 'var(--db-font-display)', fontSize: 14, fontWeight: 900,
                letterSpacing: '0.06em', color: '#fff', cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(255,107,53,0.35)',
                marginTop: 4,
              }}
            >
              ENABLE NOTIFICATIONS
            </button>
          )
        ) : (
          <div style={{ opacity: 0.4 }}>
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'var(--db-text-muted)', marginBottom: 12, marginTop: 0, lineHeight: 1.5 }}>
              Push notifications are available in the Dobber iOS app.
            </p>
            <PrefRow label="Game start alerts" control={<Toggle value={false} onChange={() => {}} disabled />} />
            <PrefRow label="Bingo line alerts" control={<Toggle value={false} onChange={() => {}} disabled />} />
            <PrefRow label="Daily game reminders" control={<Toggle value={false} onChange={() => {}} disabled />} />
          </div>
        )}
      </div>

      {/* About */}
      <div>
        <SectionLabel>About</SectionLabel>
        {[
          { label: 'Version',           right: <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 600, color: 'var(--db-text-secondary)' }}>0.1.0-beta</span> },
          { label: 'How to Play',       right: <Link to="/"    style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-primary)', textDecoration: 'none' }}>View →</Link> },
          { label: 'Contact Support',   right: <a href="mailto:ferrencesup@gmail.com" style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-primary)', textDecoration: 'none' }}>ferrencesup@gmail.com</a> },
          { label: 'Terms of Service',  right: <Link to="/terms"   style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-primary)', textDecoration: 'none' }}>View →</Link> },
          { label: 'Privacy Policy',    right: <Link to="/privacy" style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-primary)', textDecoration: 'none' }}>View →</Link> },
          ...(isIOS() ? [{ label: 'Support Dobber', right: <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-primary)' }}>bingo-v04.netlify.app/contribute</span> }] : []),
          ...(isAdmin ? [{ label: 'Admin: Featured Games', right: <Link to="/admin/featured" style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-primary)', textDecoration: 'none' }}>Manage →</Link> }] : []),
        ].map(({ label, right }) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--db-border-subtle)' }}>
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'var(--db-text-muted)' }}>{label}</span>
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
            background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 8,
            fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600,
            color: 'var(--db-text-muted)', padding: '8px 18px', cursor: 'pointer',
            transition: 'all 120ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,45,45,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,45,45,0.3)'; e.currentTarget.style.color = 'var(--db-danger)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.borderColor = 'var(--db-border-default)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
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
    <div className="px-4 py-5 md:px-6 md:py-8" style={{ minHeight: '100%', background: 'var(--db-bg-page)' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Header */}
        <h1 style={{
          fontFamily: 'var(--db-font-display)',
          fontSize: 'clamp(28px, 4vw, 42px)',
          color: 'var(--db-primary)',
          letterSpacing: '0.08em',
          margin: '0 0 24px',
          lineHeight: 1,
        }}>
          SETTINGS
        </h1>

        {/* Tab bar */}
        <div className="scrollbar-hide settings-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--db-border-subtle)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: 0 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              style={{
                fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600,
                color: tab === t.key ? 'var(--db-primary)' : 'var(--db-text-ghost)',
                padding: '10px 18px', cursor: 'pointer',
                background: 'none', border: 'none',
                borderBottom: tab === t.key ? '2px solid var(--db-primary)' : '2px solid transparent',
                marginBottom: -1, flexShrink: 0,
                transition: 'color 120ms ease',
              }}
              onMouseEnter={(e) => { if (tab !== t.key) e.currentTarget.style.color = 'var(--db-text-secondary)' }}
              onMouseLeave={(e) => { if (tab !== t.key) e.currentTarget.style.color = 'var(--db-text-ghost)' }}
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

        {/* Contribute footer */}
        <div style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid var(--db-border-subtle)', textAlign: 'center' }}>
          {isIOS() ? (
            <div style={{
              display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: '10px 22px', borderRadius: 8,
              background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.2)',
            }}>
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--db-primary)' }}>
                Support Dobber
              </span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-primary)' }}>
                bingo-v04.netlify.app/contribute
              </span>
            </div>
          ) : (
            <Link
              to="/contribute"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '10px 22px', borderRadius: 8, textDecoration: 'none',
                background: 'rgba(255,107,53,0.08)', border: '1px solid rgba(255,107,53,0.2)',
                fontFamily: 'var(--db-font-display)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.06em', color: 'var(--db-primary)',
                transition: 'background 120ms, border-color 120ms',
              }}
            >
              <DobberBallIcon size={14} />
              SUPPORT DOBBER
            </Link>
          )}
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-ghost)', margin: '8px 0 0' }}>
            Keep free-to-play sports bingo alive
          </p>
        </div>
      </div>
    </div>
  )
}
