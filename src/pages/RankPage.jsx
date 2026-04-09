import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { getFontFamily, getBadge } from '../lib/fontMap'
import BadgeEmoji from '../components/ui/BadgeEmoji.jsx'

const TABS = [
  { key: 'all_time', label: 'ALL TIME' },
  { key: 'monthly', label: 'MONTHLY' },
  { key: 'weekly', label: 'WEEKLY' },
]

export default function RankPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('all_time')
  const [players, setPlayers] = useState(null) // null = loading
  const [myRank, setMyRank] = useState(null)

  useEffect(() => {
    setPlayers(null)
    setMyRank(null)

    const load = async () => {
      if (activeTab === 'all_time') {
        // Use the view
        const { data } = await supabase
          .from('all_time_leaderboard')
          .select('user_id, username, total_dobs_earned, rank')
          .order('rank', { ascending: true })
          .limit(50)

        if (data) {
          // Fetch profile details for these users
          const userIds = data.map((d) => d.user_id)
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, name_color, name_font, equipped_badge')
            .in('id', userIds)

          const profileMap = {}
          for (const p of profiles ?? []) profileMap[p.id] = p

          const merged = data.map((d) => ({
            ...d,
            ...(profileMap[d.user_id] ?? {}),
          }))

          setPlayers(merged)

          // Find current user's rank
          if (user) {
            const me = merged.find((p) => p.user_id === user.id)
            if (me) {
              setMyRank(me)
            } else {
              // Fetch separately
              const { data: myData } = await supabase
                .from('all_time_leaderboard')
                .select('user_id, username, total_dobs_earned, rank')
                .eq('user_id', user.id)
                .maybeSingle()
              if (myData) setMyRank(myData)
            }
          }
        }
      } else {
        // Weekly or monthly — query dabs_transactions directly
        const now = new Date()
        let since
        if (activeTab === 'weekly') {
          since = new Date(now.getTime() - 7 * 86_400_000).toISOString()
        } else {
          since = new Date(now.getTime() - 30 * 86_400_000).toISOString()
        }

        const { data: txns } = await supabase
          .from('dabs_transactions')
          .select('user_id, amount')
          .gt('amount', 0)
          .gte('created_at', since)

        if (txns) {
          // Aggregate by user
          const totals = {}
          for (const t of txns) {
            totals[t.user_id] = (totals[t.user_id] ?? 0) + t.amount
          }

          const sorted = Object.entries(totals)
            .map(([user_id, total]) => ({ user_id, total_dobs_earned: total }))
            .sort((a, b) => b.total_dobs_earned - a.total_dobs_earned)
            .slice(0, 50)
            .map((item, i) => ({ ...item, rank: i + 1 }))

          // Fetch profiles
          const userIds = sorted.map((s) => s.user_id)
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, username, name_color, name_font, equipped_badge')
            .in('id', userIds)

          const profileMap = {}
          for (const p of profiles ?? []) profileMap[p.id] = p

          const merged = sorted.map((s) => ({
            ...s,
            username: profileMap[s.user_id]?.username ?? 'Guest',
            name_color: profileMap[s.user_id]?.name_color,
            name_font: profileMap[s.user_id]?.name_font,
            equipped_badge: profileMap[s.user_id]?.equipped_badge,
          }))

          setPlayers(merged)

          if (user) {
            const me = merged.find((p) => p.user_id === user.id)
            if (me) {
              setMyRank(me)
            } else {
              const myTotal = totals[user.id] ?? 0
              const myPosition = Object.values(totals).filter((v) => v > myTotal).length + 1
              setMyRank({ user_id: user.id, total_dobs_earned: myTotal, rank: myPosition, username: 'You' })
            }
          }
        }
      }
    }

    load()
  }, [activeTab, user])

  return (
    <main style={{ paddingBottom: 20, maxWidth: 600, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 0' }}>
        <h1 style={{
          fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-3xl)',
          fontWeight: 'var(--db-weight-normal)', letterSpacing: 'var(--db-tracking-wide)',
          color: 'var(--db-text-primary)', lineHeight: 'var(--db-leading-none)', margin: 0,
        }}>
          RANKINGS
        </h1>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 0, padding: '12px 20px 0',
        borderBottom: '1px solid var(--db-border-subtle)',
      }}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '6px 0 10px', marginRight: 20,
                background: 'none', cursor: 'pointer',
                borderTop: 'none', borderLeft: 'none', borderRight: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--db-primary)' : 'transparent'}`,
                color: isActive ? 'var(--db-text-primary)' : 'var(--db-text-ghost)',
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-base)',
                fontWeight: isActive ? 'var(--db-weight-semibold)' : 'var(--db-weight-medium)',
                letterSpacing: 'var(--db-tracking-normal)',
                transition: 'color 120ms ease',
              }}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* My rank banner */}
      {myRank && (
        <div style={{
          margin: '16px 20px 0', padding: '14px 16px', borderRadius: 10,
          background: 'rgba(255,107,53,0.06)', border: '1px solid rgba(255,107,53,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontFamily: 'var(--db-font-display)', fontSize: 'var(--db-text-xl)',
              color: 'var(--db-primary)', fontWeight: 'var(--db-weight-extrabold)',
            }}>
              #{myRank.rank}
            </span>
            <span style={{
              fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
              color: 'var(--db-text-secondary)',
            }}>
              Your rank
            </span>
          </div>
          <span style={{
            fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-md)',
            fontWeight: 'var(--db-weight-bold)', color: 'var(--db-primary)',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {(myRank.total_dobs_earned ?? 0).toLocaleString()} ◈
          </span>
        </div>
      )}

      {/* Loading skeleton */}
      {players === null && (
        <div style={{ padding: '16px 20px' }}>
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} style={{
              height: 44, borderRadius: 8, marginBottom: 4,
              background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-subtle)',
              animation: 'pulse 1.8s ease-in-out infinite',
            }} />
          ))}
        </div>
      )}

      {/* Leaderboard */}
      {players !== null && (
        <div style={{ padding: '12px 20px 0' }}>
          {players.length === 0 ? (
            <div style={{
              padding: '40px 20px', textAlign: 'center', borderRadius: 14,
              background: 'var(--db-bg-surface)', border: '1px dashed var(--db-border-default)',
            }}>
              <span style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
                color: 'var(--db-text-muted)',
              }}>
                No rankings yet.
              </span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {players.map((player) => {
                const isMe = user && player.user_id === user.id
                const badge = player.equipped_badge ? getBadge(player.equipped_badge) : null
                const name = (player.username ?? 'Guest').slice(0, 18)
                const rankNum = player.rank

                let rankDisplay = `${rankNum}`
                let rankColor = 'var(--db-text-ghost)'
                if (rankNum === 1) { rankDisplay = '🥇'; rankColor = 'var(--db-primary)' }
                else if (rankNum === 2) { rankDisplay = '🥈'; rankColor = 'var(--db-text-primary)' }
                else if (rankNum === 3) { rankDisplay = '🥉'; rankColor = 'var(--db-text-primary)' }

                return (
                  <div
                    key={player.user_id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      height: 44, padding: '0 8px', borderRadius: 6,
                      background: isMe ? 'rgba(34,197,94,0.06)' : 'transparent',
                      borderLeft: isMe ? '3px solid var(--db-success)' : '3px solid transparent',
                      transition: 'background 0.1s ease',
                    }}
                  >
                    {/* Rank */}
                    <span style={{
                      width: 32, textAlign: 'center', flexShrink: 0,
                      fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-base)',
                      fontWeight: 'var(--db-weight-bold)', color: rankColor,
                    }}>
                      {rankDisplay}
                    </span>

                    {/* Name */}
                    <span
                      className={player.name_color === 'rainbow' ? 'name-rainbow' : ''}
                      style={{
                        flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        fontFamily: getFontFamily(player.name_font),
                        fontSize: 'var(--db-text-base)',
                        color: player.name_color && player.name_color !== 'rainbow'
                          ? player.name_color : 'var(--db-text-primary)',
                      }}
                    >
                      {badge && <BadgeEmoji emoji={badge.emoji} size={13} />}
                      {name}
                      {isMe && (
                        <span style={{ opacity: 0.5, fontSize: 'var(--db-text-xs)', marginLeft: 4 }}>(you)</span>
                      )}
                    </span>

                    {/* Dobs */}
                    <span style={{
                      fontFamily: 'var(--db-font-mono)', fontSize: 'var(--db-text-sm)',
                      fontWeight: 'var(--db-weight-semibold)', color: 'var(--db-primary)',
                      flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                    }}>
                      {(player.total_dobs_earned ?? 0).toLocaleString()} ◈
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </main>
  )
}
