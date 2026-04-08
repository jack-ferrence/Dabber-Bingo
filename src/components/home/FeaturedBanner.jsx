import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useCountdown } from '../../hooks/useCountdown'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS, NCAA_TEAM_COLORS, hexToRgba } from '../../constants/teamColors.js'
import VerifyIdentityModal from '../featured/VerifyIdentityModal.jsx'

function getTeamColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#475569'
  if (sport === 'ncaa') return NCAA_TEAM_COLORS[abbr] ?? '#475569'
  return NBA_TEAM_COLORS[abbr] ?? '#475569'
}

function parseTeams(name) {
  const parts = (name ?? '').split(' vs ')
  return { away: parts[0]?.trim() || '???', home: parts[1]?.trim() || '???' }
}

function FeaturedCountdown({ date }) {
  const { days, hours, minutes, seconds, isExpired } = useCountdown(date)
  if (isExpired) {
    return <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 14, letterSpacing: '0.06em', color: 'var(--db-primary)' }}>LIVE NOW</span>
  }
  const parts = []
  if (days > 0) parts.push(`${days}d`)
  if (hours > 0 || days > 0) parts.push(`${hours}h`)
  parts.push(`${minutes}m`)
  if (days === 0) parts.push(`${String(seconds).padStart(2, '0')}s`)
  return <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--db-text-primary)', fontVariantNumeric: 'tabular-nums' }}>{parts.join('  ')}</span>
}

export default function FeaturedBanner() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [featured, setFeatured] = useState(null)
  const [hasEntered, setHasEntered] = useState(false)
  const [joining, setJoining] = useState(false)
  const [entryResult, setEntryResult] = useState(null)
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [entryCount, setEntryCount] = useState(0)

  useEffect(() => {
    supabase.from('featured_games').select('*').in('status', ['active', 'live']).order('starts_at', { ascending: true }).limit(1)
      .then(({ data }) => { if (data?.[0]) setFeatured(data[0]) })
  }, [])

  useEffect(() => {
    if (!featured) return
    supabase.from('featured_entries').select('id', { count: 'exact', head: true }).eq('featured_game_id', featured.id)
      .then(({ count }) => { if (count != null) setEntryCount(count) })
  }, [featured])

  useEffect(() => {
    if (!featured || !user) return
    supabase.from('featured_entries').select('id').eq('featured_game_id', featured.id).eq('user_id', user.id).maybeSingle()
      .then(({ data }) => { if (data) setHasEntered(true) })
  }, [featured, user])

  const handleJoin = async (e) => {
    e?.stopPropagation?.()
    if (!user || !featured || joining) return
    const { data: elig, error: eligErr } = await supabase.rpc('check_featured_eligibility')
    if (eligErr || !elig?.eligible) { setShowVerifyModal(true); return }
    setJoining(true); setEntryResult(null)
    try {
      const { data, error } = await supabase.rpc('join_featured_game', { p_featured_game_id: featured.id })
      if (error) throw error
      if (data?.success) {
        setHasEntered(true); setEntryCount((c) => c + 1)
        setEntryResult({ ok: true, msg: "You're in!" })
        if (data.room_id) setTimeout(() => navigate(`/room/${data.room_id}`), 1200)
      } else {
        setEntryResult({ ok: false, msg: data?.message || data?.reason || 'Could not enter' })
        if (data?.reason === 'already_entered') setHasEntered(true)
      }
    } catch (err) { setEntryResult({ ok: false, msg: err.message }) }
    setJoining(false)
  }

  const handleVerified = () => { setShowVerifyModal(false); handleJoin() }

  if (!featured) return null

  // ── Auto-generate from game data ──
  const { away, home } = parseTeams(featured.event_name || featured.title)
  const sport = featured.sport ?? 'nba'
  const awayColor = getTeamColor(away, sport)
  const homeColor = getTeamColor(home, sport)
  const hasPrizeImg = !!featured.prize_image_url

  return (
    <div style={{ padding: '16px 20px 0' }}>
      <div
        onClick={() => { if (hasEntered && featured.room_id) navigate(`/room/${featured.room_id}`) }}
        style={{
          borderRadius: 14, overflow: 'hidden', position: 'relative',
          cursor: hasEntered && featured.room_id ? 'pointer' : 'default',
        }}
      >
        {/* ══════════════════════════════════════════════════════
            AUTO-GENERATED BANNER — team colors + prize image
            ══════════════════════════════════════════════════════ */}
        <div style={{
          background: `linear-gradient(135deg, ${hexToRgba(awayColor, 0.5)} 0%, var(--db-bg-page) 45%, var(--db-bg-page) 55%, ${hexToRgba(homeColor, 0.5)} 100%)`,
          padding: '20px 18px 16px',
          position: 'relative',
          overflow: 'hidden',
          minHeight: 180,
        }}>
          {/* Subtle team color glows */}
          <div style={{
            position: 'absolute', top: -40, left: -40, width: 200, height: 200,
            background: `radial-gradient(circle, ${hexToRgba(awayColor, 0.25)} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />
          <div style={{
            position: 'absolute', bottom: -40, right: -40, width: 200, height: 200,
            background: `radial-gradient(circle, ${hexToRgba(homeColor, 0.25)} 0%, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', zIndex: 1, display: 'flex', gap: 12, alignItems: 'center' }}>
            {/* Left side: matchup + details */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <span style={{
                  fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.1em',
                  color: 'var(--db-primary)', background: 'rgba(255,107,53,0.15)', padding: '3px 10px', borderRadius: 4,
                }}>⭐ FEATURED</span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)' }}>
                  {sport.toUpperCase()}
                </span>
              </div>

              {/* Team matchup — auto-generated */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 26, fontWeight: 900, color: 'var(--db-text-bright)', letterSpacing: '0.01em', lineHeight: 1 }}>{away}</span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-ghost)' }}>vs</span>
                <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 26, fontWeight: 900, color: 'var(--db-text-bright)', letterSpacing: '0.01em', lineHeight: 1 }}>{home}</span>
              </div>

              {/* Subtitle / prize tagline */}
              {featured.subtitle && (
                <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: 'var(--db-primary)', fontWeight: 600, margin: '0 0 12px' }}>
                  {featured.subtitle}
                </p>
              )}

              {/* Prize name — big and bold */}
              <div style={{ marginBottom: 4 }}>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--db-text-muted)', display: 'block', marginBottom: 2 }}>WIN</span>
                <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 18, fontWeight: 800, color: 'var(--db-text-primary)', letterSpacing: '0.01em' }}>
                  {featured.prize_name}
                </span>
                {featured.prize_value && (
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-muted)', marginLeft: 8 }}>
                    ({featured.prize_value})
                  </span>
                )}
              </div>
            </div>

            {/* Right side: Prize image (transparent PNG) */}
            {hasPrizeImg && (
              <div style={{ flexShrink: 0, width: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img
                  src={featured.prize_image_url}
                  alt={featured.prize_name}
                  style={{
                    maxWidth: '100%', maxHeight: 140, objectFit: 'contain',
                    filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.5))',
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════
            INFO + JOIN BUTTON — below the banner graphic
            ══════════════════════════════════════════════════════ */}
        <div style={{
          background: 'var(--db-bg-surface)',
          borderTop: '1px solid var(--db-border-subtle)',
          padding: '14px 18px 16px',
        }}>
          {/* Stats row */}
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--db-text-muted)', display: 'block', marginBottom: 2 }}>STARTS IN</span>
              <FeaturedCountdown date={featured.starts_at} />
            </div>
            <div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--db-text-muted)', display: 'block', marginBottom: 2 }}>ENTRY</span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--db-text-primary)' }}>
                {featured.free_entry ? 'FREE' : `${featured.entry_fee} Dobs`}
              </span>
            </div>
            <div>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, letterSpacing: '0.08em', color: 'var(--db-text-muted)', display: 'block', marginBottom: 2 }}>PLAYERS</span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--db-text-primary)' }}>{entryCount}</span>
            </div>
          </div>

          {/* Entry result */}
          {entryResult && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 10,
              background: entryResult.ok ? 'rgba(34,197,94,0.08)' : 'rgba(255,45,45,0.08)',
              border: `1px solid ${entryResult.ok ? 'rgba(34,197,94,0.2)' : 'rgba(255,45,45,0.2)'}`,
            }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: entryResult.ok ? 'var(--db-success)' : 'var(--db-live)' }}>{entryResult.msg}</span>
            </div>
          )}

          {/* Join button */}
          {hasEntered ? (
            <button type="button"
              onClick={(e) => { e.stopPropagation(); if (featured.room_id) navigate(`/room/${featured.room_id}`) }}
              style={{
                width: '100%', padding: '14px', borderRadius: 8,
                border: '1px solid rgba(34,197,94,0.25)', background: 'rgba(34,197,94,0.08)',
                fontFamily: 'var(--db-font-display)', fontSize: 14, fontWeight: 700, letterSpacing: '0.03em', color: 'var(--db-success)', cursor: 'pointer',
              }}
            >✓ ENTERED{featured.room_id ? ' — TAP TO PLAY' : ''}</button>
          ) : (
            <button type="button" onClick={handleJoin} disabled={joining}
              style={{
                width: '100%', padding: '14px', borderRadius: 8, border: 'none',
                background: 'var(--db-gradient-primary)',
                fontFamily: 'var(--db-font-display)', fontSize: 15, fontWeight: 800, letterSpacing: '0.04em', color: '#fff',
                cursor: joining ? 'wait' : 'pointer', opacity: joining ? 0.5 : 1,
                boxShadow: '0 4px 16px rgba(255,107,53,0.3)',
              }}
            >{joining ? 'JOINING…' : featured.free_entry ? 'ENTER FREE' : `ENTER · ${featured.entry_fee} DOBS`}</button>
          )}
        </div>

        {/* Winner overlay */}
        {featured.status === 'finished' && featured.winner_username && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 5, background: 'var(--db-bg-overlay)', borderRadius: 14,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--db-primary)', marginBottom: 6 }}>🏆 WINNER</span>
            <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 28, fontWeight: 900, color: 'var(--db-text-primary)' }}>{featured.winner_username}</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, color: 'var(--db-text-muted)', marginTop: 6 }}>Won {featured.prize_name}!</span>
          </div>
        )}
      </div>

      {showVerifyModal && (
        <VerifyIdentityModal onClose={() => setShowVerifyModal(false)} onVerified={handleVerified} />
      )}
    </div>
  )
}
