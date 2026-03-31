import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { getFontFamily, getBadge } from '../../lib/fontMap'

const RANK_COLORS = ['#ff6b35', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.7)', 'rgba(255,255,255,0.3)', 'rgba(255,255,255,0.3)']

export default function TopPlayers() {
  const [players, setPlayers] = useState(null) // null = loading

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, username, total_earned, name_color, name_font, equipped_badge')
      .order('total_earned', { ascending: false })
      .limit(5)
      .then(({ data }) => setPlayers(data ?? []))
  }, [])

  const playerRows = players === null ? null : players.map((p, i) => {
    const badge = p.equipped_badge ? getBadge(p.equipped_badge) : null
    const name = (p.username ?? 'Guest').slice(0, 14)
    return { p, i, badge, name }
  })

  return (
    <>
      {/* ── Desktop: bordered box layout ── */}
      <div className="hidden md:block" style={{
        background: 'linear-gradient(160deg, #141420 0%, #0f0f1a 100%)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 10,
        padding: '12px 16px',
      }}>
        <p style={{ fontFamily: 'var(--db-font-display)', fontSize: 12, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
          TOP PLAYERS
        </p>
        {players === null ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} style={{ height: 26, borderRadius: 4, background: 'rgba(255,255,255,0.04)' }} />
            ))}
          </div>
        ) : players.length === 0 ? (
          <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No players yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {playerRows.map(({ p, i, badge, name }) => (
              <div
                key={p.id}
                style={{ display: 'flex', alignItems: 'center', gap: 8, height: 28, borderRadius: 4, padding: '0 4px', transition: 'background 0.1s ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.05)' }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
              >
                <span style={{ width: 18, textAlign: 'right', fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 700, color: RANK_COLORS[i], flexShrink: 0 }}>{i + 1}</span>
                <span
                  className={p.name_color === 'rainbow' ? 'name-rainbow' : ''}
                  style={{ flex: 1, fontFamily: getFontFamily(p.name_font), fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: p.name_color && p.name_color !== 'rainbow' ? p.name_color : 'rgba(255,255,255,0.75)' }}
                >
                  {badge && <span style={{ fontSize: 12, marginRight: 3 }}>{badge.emoji}</span>}
                  {name}
                </span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 600, color: '#ff6b35', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{(p.total_earned ?? 0).toLocaleString()} ◈</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Mobile: inline horizontal scroll ── */}
      <div className="block md:hidden">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>
            TOP PLAYERS
          </span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.06)' }} />
        </div>
        {players === null ? (
          <div style={{ height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.04)', width: '60%' }} />
        ) : players.length === 0 ? null : (
          <div className="leaderboard-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 2, WebkitOverflowScrolling: 'touch' }}>
            {playerRows.map(({ p, i, badge, name }) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: i === 0 ? '#ff6b35' : 'rgba(255,255,255,0.4)' }}>
                  {i + 1}
                </span>
                {badge && <span style={{ fontSize: 11 }}>{badge.emoji}</span>}
                <span
                  className={p.name_color === 'rainbow' ? 'name-rainbow' : ''}
                  style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: i === 0 ? 600 : 400, color: i === 0 ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.5)' }}
                >
                  {name}
                </span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'rgba(255,107,53,0.75)', fontVariantNumeric: 'tabular-nums' }}>
                  {(p.total_earned ?? 0).toLocaleString()} ◈
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
