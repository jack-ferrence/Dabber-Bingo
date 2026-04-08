import { useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.js'
import { hapticSelection } from '../../lib/haptics.js'
import { TEAMS_BY_SPORT } from '../../constants/teams.js'
import { NBA_TEAM_COLORS, MLB_TEAM_COLORS } from '../../constants/teamColors.js'

function getColor(abbr, sport) {
  if (sport === 'mlb') return MLB_TEAM_COLORS[abbr] ?? '#475569'
  return NBA_TEAM_COLORS[abbr] ?? '#475569'
}

export default function FavoriteTeamsPicker({ sport }) {
  const { user } = useAuth()
  const { favoriteTeams } = useProfile()
  const [expanded, setExpanded] = useState(false)
  const [saving, setSaving] = useState(false)

  const teams = TEAMS_BY_SPORT[sport] ?? []
  const favs = favoriteTeams?.[sport] ?? []

  const toggle = useCallback(async (abbr) => {
    if (!user || saving) return
    hapticSelection()
    setSaving(true)

    const current = favoriteTeams?.[sport] ?? []
    const next = current.includes(abbr)
      ? current.filter((a) => a !== abbr)
      : [...current, abbr]

    const updated = { ...favoriteTeams, [sport]: next }

    await supabase
      .from('profiles')
      .update({ favorite_teams: updated })
      .eq('id', user.id)

    setSaving(false)
  }, [user, sport, favoriteTeams, saving])

  if (!teams.length) return null

  return (
    <div style={{ padding: '0 20px' }}>
      <button
        onClick={() => { hapticSelection(); setExpanded((e) => !e) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '8px 0',
          fontFamily: 'var(--db-font-mono)', fontSize: 11,
          color: favs.length > 0 ? 'var(--db-primary)' : 'var(--db-text-ghost)',
          letterSpacing: '0.02em',
        }}
      >
        <span style={{ fontSize: 13 }}>★</span>
        {favs.length > 0
          ? `${favs.join(', ')}`
          : 'Pick favorite teams'
        }
        <span style={{
          fontSize: 9, transition: 'transform 150ms ease',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}>▼</span>
      </button>

      {expanded && (
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 6,
          paddingBottom: 12,
        }}>
          {teams.map((team) => {
            const isFav = favs.includes(team.abbr)
            const teamColor = getColor(team.abbr, sport)
            return (
              <button
                key={team.abbr}
                onClick={() => toggle(team.abbr)}
                style={{
                  minWidth: 44, minHeight: 36,
                  padding: '6px 10px',
                  borderRadius: 8,
                  border: `1px solid ${isFav ? teamColor : 'var(--db-border-subtle)'}`,
                  background: isFav ? `${teamColor}22` : 'var(--db-bg-elevated)',
                  cursor: 'pointer',
                  fontFamily: 'var(--db-font-mono)',
                  fontSize: 11, fontWeight: 600,
                  color: isFav ? teamColor : 'var(--db-text-muted)',
                  letterSpacing: '0.02em',
                  transition: 'all 120ms ease',
                  opacity: saving ? 0.6 : 1,
                }}
              >
                {team.abbr}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
