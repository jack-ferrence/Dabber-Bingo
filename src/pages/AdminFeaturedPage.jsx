import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'

const SPORTS = [
  { key: 'nba', label: 'NBA', icon: '🏀' },
  { key: 'ncaa', label: 'NCAA', icon: '🏆' },
  { key: 'mlb', label: 'MLB', icon: '⚾' },
  { key: 'nfl', label: 'NFL', icon: '🏈' },
]

const STATUS_COLORS = {
  draft: 'var(--db-text-secondary)',
  active: 'var(--db-success)',
  live: 'var(--db-live)',
  finished: 'var(--db-text-secondary)',
  cancelled: 'var(--db-primary)',
}

// ── Image uploader ──────────────────────────────────────────────────────────
function ImageUploader({ label, value, onChange }) {
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState(value || null)
  const [err, setErr] = useState('')

  useEffect(() => { setPreview(value || null) }, [value])

  const processFile = (file) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setErr('File must be an image.'); return }
    if (file.size > 2 * 1024 * 1024) { setErr('Image must be under 2 MB.'); return }
    setErr('')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const dataUrl = ev.target.result
      setPreview(dataUrl)
      onChange(dataUrl)
    }
    reader.readAsDataURL(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    processFile(e.dataTransfer.files?.[0])
  }

  const handleDragOver = (e) => { e.preventDefault(); setDragging(true) }
  const handleDragLeave = () => setDragging(false)

  const handleFileInput = (e) => processFile(e.target.files?.[0])

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {preview ? (
        <div style={{ marginBottom: 8, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--db-border-default)', maxWidth: 320, position: 'relative' }}>
          <img src={preview} alt="Preview" loading="lazy" style={{ width: '100%', height: 'auto', display: 'block' }} />
          <button type="button" onClick={() => { setPreview(null); onChange(null) }}
            style={{ position: 'absolute', top: 6, right: 6, background: 'var(--db-bg-overlay)', border: 'none', color: 'var(--db-live)', fontFamily: 'var(--db-font-mono)', fontSize: 10, cursor: 'pointer', padding: '4px 8px', borderRadius: 4 }}>
            REMOVE
          </button>
        </div>
      ) : (
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, width: '100%', maxWidth: 320, height: 120,
            borderRadius: 8, border: `2px dashed ${dragging ? 'var(--db-primary)' : 'var(--db-border-default)'}`,
            background: dragging ? 'rgba(255,107,53,0.06)' : 'var(--db-bg-surface)',
            color: 'var(--db-text-secondary)', fontFamily: 'var(--db-font-mono)', fontSize: 11,
            cursor: 'pointer', transition: 'border-color 150ms, background 150ms',
          }}>
          <span style={{ fontSize: 24 }}>+</span>
          <span>DROP IMAGE OR CLICK TO UPLOAD</span>
          <input type="file" accept="image/*" onChange={handleFileInput} style={{ display: 'none' }} />
        </label>
      )}
      {err && <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-live)', marginTop: 4 }}>{err}</p>}
    </div>
  )
}

// ── Form field wrapper ──────────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        {label}
      </label>
      {children}
      {hint && <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'var(--db-text-ghost)', marginTop: 4 }}>{hint}</p>}
    </div>
  )
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 6,
  background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-default)', color: 'var(--db-text-primary)',
  fontFamily: 'var(--db-font-mono)', fontSize: 13,
  boxSizing: 'border-box',
}

// ── Create/Edit Form ────────────────────────────────────────────────────────
function FeaturedGameForm({ game, onSave, onCancel, userId }) {
  const [form, setForm] = useState({
    sport: game?.sport || 'nba',
    title: game?.title || '',
    subtitle: game?.subtitle || '',
    description: game?.description || '',
    event_name: game?.event_name || '',
    home_team: game?.home_team || '',
    away_team: game?.away_team || '',
    prize_name: game?.prize_name || '',
    prize_value: game?.prize_value || '',
    prize_image_url: game?.prize_image_url || '',
    entry_fee: game?.entry_fee ?? 100,
    max_entries: game?.max_entries || '',
    free_entry: game?.free_entry || false,
    starts_at: game?.starts_at ? new Date(game.starts_at).toISOString().slice(0, 16) : '',
    game_id: game?.game_id || '',
  })
  const [saving, setSaving] = useState(false)
  const [fetchingEspn, setFetchingEspn] = useState(false)
  const [espnInput, setEspnInput] = useState(game?.game_id ? `ESPN ID: ${game.game_id}` : '')

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }))

  const parseAndFetch = async (input) => {
    if (!input) return
    setFetchingEspn(true)

    const gameId = input.match(/(\d{8,12})/)?.[1]
    if (!gameId) {
      alert('Could not find a game ID in that URL.')
      setFetchingEspn(false)
      return
    }

    const sportHints = []
    if (/\/nba\//i.test(input)) sportHints.push('nba')
    if (/\/mlb\//i.test(input) || /\/baseball\//i.test(input)) sportHints.push('mlb')
    if (/\/mens-college-basketball\//i.test(input) || /\/ncaa/i.test(input)) sportHints.push('ncaa')

    const allSports = [
      { sport: 'nba',  url: `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${gameId}` },
      { sport: 'ncaa', url: `https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary?event=${gameId}` },
      { sport: 'mlb',  url: `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${gameId}` },
    ]
    const endpoints = [
      ...allSports.filter(e => sportHints.includes(e.sport)),
      ...allSports.filter(e => !sportHints.includes(e.sport)),
    ]

    for (const { sport, url } of endpoints) {
      try {
        const res = await fetch(url)
        if (!res.ok) continue
        const data = await res.json()
        const competition = data.header?.competitions?.[0]
        if (!competition) continue
        const competitors = competition?.competitors ?? []
        const home = competitors.find(c => c.homeAway === 'home')
        const away = competitors.find(c => c.homeAway === 'away')
        if (!home || !away) continue

        const homeAbbr = home.team?.abbreviation ?? ''
        const awayAbbr = away.team?.abbreviation ?? ''
        const homeName = home.team?.displayName ?? homeAbbr
        const awayName = away.team?.displayName ?? awayAbbr

        set('game_id', gameId)
        set('sport', sport)
        set('home_team', homeAbbr)
        set('away_team', awayAbbr)
        set('event_name', `${awayName} vs ${homeName}`)
        set('title', `${awayAbbr} vs ${homeAbbr}`)
        if (competition.date) set('starts_at', new Date(competition.date).toISOString().slice(0, 16))

        setEspnInput(`✓ ${awayAbbr} vs ${homeAbbr} (${sport.toUpperCase()})`)
        setFetchingEspn(false)
        return
      } catch (e) { continue }
    }

    alert('Could not find that game on ESPN. Check the URL.')
    setFetchingEspn(false)
  }

  const handleSubmit = async () => {
    if (!form.title || !form.prize_name || !form.starts_at || !form.sport) {
      alert('Title, prize name, sport, and start time are required.')
      return
    }
    setSaving(true)

    const payload = {
      sport: form.sport,
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      description: form.description.trim() || null,
      event_name: form.event_name.trim() || null,
      home_team: form.home_team.trim().toUpperCase() || null,
      away_team: form.away_team.trim().toUpperCase() || null,
      prize_name: form.prize_name.trim(),
      prize_value: form.prize_value.trim() || null,
      prize_image_url: form.prize_image_url || null,
      entry_fee: parseInt(form.entry_fee, 10) || 100,
      max_entries: form.max_entries ? parseInt(form.max_entries, 10) : null,
      free_entry: form.free_entry,
      starts_at: new Date(form.starts_at).toISOString(),
      game_id: form.game_id.trim() || null,
      updated_at: new Date().toISOString(),
    }

    try {
      if (game?.id) {
        const { error } = await supabase.from('featured_games').update(payload).eq('id', game.id)
        if (error) throw error
      } else {
        payload.status = 'draft'
        const { error } = await supabase.from('featured_games').insert(payload)
        if (error) throw error
      }
      onSave()
    } catch (err) {
      console.error('Save error:', err)
      alert('Save failed: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-default)', borderRadius: 8, padding: 24, maxWidth: 640 }}>
      <h3 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: 'var(--db-text-primary)', letterSpacing: '0.08em', marginBottom: 20 }}>
        {game?.id ? 'EDIT FEATURED GAME' : 'CREATE FEATURED GAME'}
      </h3>

      <Field label="Sport">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SPORTS.map((s) => (
            <button key={s.key} type="button" onClick={() => set('sport', s.key)}
              style={{
                padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: form.sport === s.key ? 'var(--db-primary)' : 'var(--db-bg-elevated)',
                color: form.sport === s.key ? 'var(--db-text-on-primary)' : 'var(--db-text-secondary)',
                fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
              }}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Title *" hint="e.g. NBA Finals Game 7 BINGO">
        <input style={inputStyle} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="NBA Finals Game 7 BINGO" />
      </Field>

      <Field label="Subtitle" hint="Shown below title on banner">
        <input style={inputStyle} value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Win AirPods Pro 2!" />
      </Field>

      <Field label="Event Name" hint="e.g. Lakers vs Celtics">
        <input style={inputStyle} value={form.event_name} onChange={(e) => set('event_name', e.target.value)} placeholder="Lakers vs Celtics" />
      </Field>

      <div style={{ display: 'flex', gap: 12 }}>
        <Field label="Away Team Abbr">
          <input style={{ ...inputStyle, width: 120 }} value={form.away_team} onChange={(e) => set('away_team', e.target.value)} placeholder="LAL" />
        </Field>
        <Field label="Home Team Abbr">
          <input style={{ ...inputStyle, width: 120 }} value={form.home_team} onChange={(e) => set('home_team', e.target.value)} placeholder="BOS" />
        </Field>
      </div>

      <Field label="ESPN Game Link" hint="Paste the ESPN game URL — everything auto-fills">
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="text"
            value={espnInput}
            onChange={(e) => setEspnInput(e.target.value)}
            onPaste={(e) => {
              setTimeout(() => {
                const val = e.target.value.trim()
                if (val && val.length > 5) parseAndFetch(val)
              }, 100)
            }}
            placeholder="https://www.espn.com/nba/game/_/gameId/..."
            style={inputStyle}
          />
          <button
            type="button"
            onClick={() => parseAndFetch(espnInput)}
            disabled={!espnInput || fetchingEspn}
            style={{
              padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: espnInput ? 'var(--db-primary)' : 'var(--db-border-default)',
              color: espnInput ? 'var(--db-text-on-primary)' : 'var(--db-text-secondary)',
              fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 800,
              whiteSpace: 'nowrap', opacity: fetchingEspn ? 0.5 : 1,
            }}
          >
            {fetchingEspn ? 'FETCHING...' : 'FETCH'}
          </button>
        </div>
      </Field>

      <Field label="Game Start Time *">
        <input type="datetime-local" style={inputStyle} value={form.starts_at} onChange={(e) => set('starts_at', e.target.value)} />
      </Field>

      <div style={{ borderTop: '1px solid var(--db-border-default)', marginTop: 20, paddingTop: 20 }}>
        <h4 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--db-primary)', letterSpacing: '0.08em', marginBottom: 16 }}>
          PRIZE DETAILS
        </h4>

        <Field label="Prize Name *" hint="e.g. AirPods Pro 2">
          <input style={inputStyle} value={form.prize_name} onChange={(e) => set('prize_name', e.target.value)} placeholder="AirPods Pro 2" />
        </Field>

        <Field label="Prize Value" hint="Display only, e.g. $249">
          <input style={inputStyle} value={form.prize_value} onChange={(e) => set('prize_value', e.target.value)} placeholder="$249" />
        </Field>

        <ImageUploader label="Prize Image" value={form.prize_image_url} onChange={(url) => set('prize_image_url', url)} />
      </div>

      <div style={{ borderTop: '1px solid var(--db-border-default)', marginTop: 20, paddingTop: 20 }}>
        <h4 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--db-primary)', letterSpacing: '0.08em', marginBottom: 16 }}>
          ENTRY CONFIG
        </h4>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Field label="Entry Fee (Dobs)">
            <input type="number" style={{ ...inputStyle, width: 120 }} value={form.entry_fee} onChange={(e) => set('entry_fee', e.target.value)} min={0} />
          </Field>
          <Field label="Max Entries" hint="Leave blank for unlimited">
            <input type="number" style={{ ...inputStyle, width: 120 }} value={form.max_entries} onChange={(e) => set('max_entries', e.target.value)} min={1} />
          </Field>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 8 }}>
          <input type="checkbox" checked={form.free_entry} onChange={(e) => set('free_entry', e.target.checked)}
            style={{ width: 18, height: 18, accentColor: 'var(--db-primary)' }} />
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-primary)' }}>
            FREE ENTRY (marketing promo)
          </span>
        </label>
      </div>

      <Field label="Description / Rules" hint="Optional longer text shown on detail view">
        <textarea style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }} value={form.description}
          onChange={(e) => set('description', e.target.value)} placeholder="Full rules and details..." />
      </Field>

      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <button type="button" onClick={handleSubmit} disabled={saving}
          style={{
            padding: '10px 24px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: 'var(--db-primary)', color: 'var(--db-text-on-primary)', fontFamily: 'var(--db-font-mono)',
            fontSize: 12, fontWeight: 800, letterSpacing: '0.06em',
            opacity: saving ? 0.5 : 1,
          }}>
          {saving ? 'SAVING...' : game?.id ? 'UPDATE' : 'CREATE'}
        </button>
        <button type="button" onClick={onCancel}
          style={{
            padding: '10px 24px', borderRadius: 6, border: '1px solid var(--db-border-default)', cursor: 'pointer',
            background: 'transparent', color: 'var(--db-text-secondary)', fontFamily: 'var(--db-font-mono)',
            fontSize: 12, fontWeight: 700,
          }}>
          CANCEL
        </button>
      </div>
    </div>
  )
}

// ── Game Card (list item) ───────────────────────────────────────────────────
function FeaturedGameCard({ game, onEdit, onStatusChange, onAwardWinner, userId }) {
  const statusColor = STATUS_COLORS[game.status] || 'var(--db-text-secondary)'

  return (
    <div style={{
      background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-default)', borderRadius: 8,
      padding: 16, display: 'flex', gap: 16, alignItems: 'flex-start',
    }}>
      {game.prize_image_url && (
        <div style={{ width: 72, height: 72, borderRadius: 6, overflow: 'hidden', flexShrink: 0, border: '1px solid var(--db-border-default)' }}>
          <img src={game.prize_image_url} alt={game.prize_name} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{
            fontSize: 9, fontWeight: 800, padding: '2px 8px', borderRadius: 4,
            background: `${statusColor}22`, color: statusColor, fontFamily: 'var(--db-font-mono)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>
            {game.status}
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)' }}>
            {game.sport.toUpperCase()}
          </span>
          {game.free_entry && (
            <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'var(--db-success-bg)', color: 'var(--db-success)', fontFamily: 'var(--db-font-mono)' }}>
              FREE
            </span>
          )}
        </div>

        <h4 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: 'var(--db-text-primary)', margin: '4px 0 2px' }}>
          {game.title}
        </h4>

        {game.event_name && (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-secondary)', margin: '0 0 4px' }}>
            {game.event_name}
          </p>
        )}

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 6 }}>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)' }}>
            🏆 {game.prize_name} {game.prize_value && `(${game.prize_value})`}
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)' }}>
            💰 {game.free_entry ? 'FREE' : `${game.entry_fee} Dobs`}
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)' }}>
            👥 {game.entries_count} entries
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)' }}>
            📅 {new Date(game.starts_at).toLocaleDateString()} {new Date(game.starts_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
          {game.room_id && (
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-success)' }}>
              ✓ Room linked
            </span>
          )}
        </div>

        {game.winner_username && (
          <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 4, background: 'var(--db-primary)15', border: '1px solid var(--db-primary)30' }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-primary)', fontWeight: 700 }}>
              WINNER: {game.winner_username} {game.winner_claimed ? '✅ Claimed' : '⏳ Unclaimed'}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => onEdit(game)}
            style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--db-border-default)', background: 'transparent', color: 'var(--db-text-secondary)', fontFamily: 'var(--db-font-mono)', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
            EDIT
          </button>

          {game.status === 'draft' && (
            <button type="button" onClick={() => onStatusChange(game.id, 'active')}
              style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: 'var(--db-success)', color: 'var(--db-text-on-primary)', fontFamily: 'var(--db-font-mono)', fontSize: 10, cursor: 'pointer', fontWeight: 800 }}>
              PUBLISH
            </button>
          )}

          {game.status === 'active' && (
            <>
              <button type="button" onClick={() => onStatusChange(game.id, 'draft')}
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid var(--db-text-muted)', background: 'transparent', color: 'var(--db-text-secondary)', fontFamily: 'var(--db-font-mono)', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                UNPUBLISH
              </button>
              <button type="button" onClick={() => onStatusChange(game.id, 'cancelled')}
                style={{ padding: '6px 12px', borderRadius: 4, border: '1px solid #ff2d2d', background: 'transparent', color: 'var(--db-live)', fontFamily: 'var(--db-font-mono)', fontSize: 10, cursor: 'pointer', fontWeight: 700 }}>
                CANCEL
              </button>
            </>
          )}

          {(game.status === 'live' || game.status === 'finished') && !game.winner_user_id && (
            <button type="button" onClick={() => onAwardWinner(game.id)}
              style={{ padding: '6px 12px', borderRadius: 4, border: 'none', background: 'var(--db-primary)', color: 'var(--db-text-on-primary)', fontFamily: 'var(--db-font-mono)', fontSize: 10, cursor: 'pointer', fontWeight: 800 }}>
              AWARD WINNER
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main Admin Page ─────────────────────────────────────────────────────────
export default function AdminFeaturedPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [games, setGames] = useState([])
  const [editing, setEditing] = useState(null)
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('is_admin').eq('id', user.id).single()
      .then(({ data }) => {
        if (data?.is_admin) {
          setIsAdmin(true)
        } else {
          navigate('/')
        }
        setLoading(false)
      })
  }, [user, navigate])

  const fetchGames = useCallback(async () => {
    const { data, error } = await supabase
      .from('featured_games')
      .select('*')
      .order('starts_at', { ascending: false })
    if (!error && data) setGames(data)
  }, [])

  useEffect(() => { if (isAdmin) fetchGames() }, [isAdmin, fetchGames])

  const handleStatusChange = async (id, newStatus) => {
    const confirmed = window.confirm(`Change status to "${newStatus}"?`)
    if (!confirmed) return

    if (newStatus === 'active') {
      const game = games.find((g) => g.id === id)
      if (game && game.game_id && !game.room_id) {
        const { data: roomData, error: roomErr } = await supabase.from('rooms').insert({
          name: `⭐ ${game.title}`,
          game_id: game.game_id,
          sport: game.sport,
          room_type: 'public',
          status: 'lobby',
          starts_at: game.starts_at,
          created_by: user.id,
        }).select('id').single()

        if (!roomErr && roomData) {
          await supabase.from('featured_games').update({ room_id: roomData.id, status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
          fetchGames()
          return
        }
        console.warn('Room creation failed, updating status only:', roomErr)
      }
    }

    await supabase.from('featured_games').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', id)
    fetchGames()
  }

  const handleAwardWinner = async (id) => {
    const confirmed = window.confirm('Award the winner? This picks the #1 ranked player.')
    if (!confirmed) return

    const { data, error } = await supabase.rpc('award_featured_winner', { p_featured_game_id: id })
    if (error) {
      alert('Error awarding winner: ' + error.message)
      return
    }
    if (data?.success) {
      alert(`Winner: ${data.winner_username}!`)
    } else {
      alert('Could not award: ' + (data?.reason || 'unknown'))
    }
    fetchGames()
  }

  const filteredGames = filter === 'all' ? games : games.filter((g) => g.status === filter)

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-secondary)' }}>Checking admin access...</span>
      </div>
    )
  }

  if (!isAdmin) return null

  return (
    <div style={{ padding: '24px 16px', maxWidth: 800, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--db-font-display)', fontSize: 28, color: 'var(--db-text-primary)', letterSpacing: '0.04em', lineHeight: 1, margin: 0 }}>
            FEATURED GAMES
          </h1>
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-ghost)', marginTop: 4, letterSpacing: '0.06em' }}>
            ADMIN DASHBOARD
          </p>
        </div>
        {!editing && (
          <button type="button" onClick={() => setEditing('new')}
            style={{
              padding: '10px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: 'var(--db-primary)', color: 'var(--db-text-on-primary)', fontFamily: 'var(--db-font-mono)',
              fontSize: 11, fontWeight: 800, letterSpacing: '0.06em',
            }}>
            + NEW GAME
          </button>
        )}
      </div>

      {editing ? (
        <FeaturedGameForm
          game={editing === 'new' ? null : editing}
          userId={user?.id}
          onSave={() => { setEditing(null); fetchGames() }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <>
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, flexWrap: 'wrap' }}>
            {['all', 'draft', 'active', 'live', 'finished', 'cancelled'].map((f) => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                style={{
                  padding: '6px 14px', borderRadius: 16, border: 'none', cursor: 'pointer',
                  background: filter === f ? 'var(--db-primary)' : 'var(--db-bg-elevated)',
                  color: filter === f ? 'var(--db-text-on-primary)' : 'var(--db-text-secondary)',
                  fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                {f} {f !== 'all' && `(${games.filter((g) => g.status === f).length})`}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filteredGames.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center' }}>
                <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-secondary)' }}>
                  No featured games {filter !== 'all' ? `with status "${filter}"` : 'yet'}. Create one!
                </p>
              </div>
            ) : (
              filteredGames.map((game) => (
                <FeaturedGameCard
                  key={game.id}
                  game={game}
                  userId={user?.id}
                  onEdit={setEditing}
                  onStatusChange={handleStatusChange}
                  onAwardWinner={handleAwardWinner}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
