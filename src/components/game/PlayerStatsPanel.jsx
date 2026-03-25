import { memo, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Badge from '../ui/Badge.jsx'

const STAT_KEYS = [
  { key: 'points',   label: 'PTS',  types: ['points', 'points_10', 'points_15', 'points_20', 'points_25'] },
  { key: 'rebounds',  label: 'REB',  types: ['rebounds', 'rebound_5', 'rebound_10'] },
  { key: 'assists',   label: 'AST',  types: ['assists', 'assist_5', 'assist_10'] },
  { key: 'threes',    label: '3PM',  types: ['threes', 'three_pointer'] },
  { key: 'steals',    label: 'STL',  types: ['steals', 'steal'] },
  { key: 'blocks',    label: 'BLK',  types: ['blocks', 'block'] },
]

function bestValueForCategory(events, types) {
  let best = 0
  for (const ev of events) {
    if (types.includes(ev.stat_type) && Number(ev.value) > best) {
      best = Number(ev.value)
    }
  }
  return best
}

function progressBarColor(current, threshold, marked) {
  if (marked) return 'bg-accent-green'
  const pct = threshold > 0 ? current / threshold : 0
  if (pct >= 0.75) return 'bg-accent-gold'
  if (pct >= 0.5) return 'bg-accent-purple'
  return 'bg-text-muted'
}

function awayLabel(current, threshold, marked) {
  if (marked) return null
  const diff = threshold - current
  if (diff <= 0) return null
  return `${diff} away`
}

function PlayerStatsPanel({ playerId, playerName, playerSquares, gameId, realtimeStatEvents, resetStatEvents, onClose }) {
  const [events, setEvents] = useState([])

  // Initial fetch for this player
  useEffect(() => {
    if (!gameId || !playerId) return

    const fetchEvents = async () => {
      const { data } = await supabase
        .from('stat_events')
        .select('*')
        .eq('game_id', gameId)
        .eq('player_id', playerId)
        .order('fired_at', { ascending: false })
      const evts = data ?? []
      setEvents(evts)
      if (resetStatEvents) resetStatEvents(evts)
    }

    fetchEvents()
  }, [gameId, playerId, resetStatEvents])

  // Merge realtime stat events for this player (already batched by useRoomChannel)
  const playerEvents = useMemo(() => {
    if (!realtimeStatEvents || realtimeStatEvents.length === 0) return events
    const existingIds = new Set(events.map((e) => e.id))
    const newForPlayer = realtimeStatEvents.filter(
      (e) => e.player_id === playerId && !existingIds.has(e.id)
    )
    if (newForPlayer.length === 0) return events
    return [...newForPlayer, ...events]
  }, [events, realtimeStatEvents, playerId])

  const statSummary = useMemo(() => {
    return STAT_KEYS.map((cat) => ({
      ...cat,
      value: bestValueForCategory(playerEvents, cat.types),
    }))
  }, [playerEvents])

  const currentValues = useMemo(() => {
    const map = {}
    for (const ev of playerEvents) {
      const key = ev.stat_type
      if (!map[key] || Number(ev.value) > map[key]) {
        map[key] = Number(ev.value)
      }
    }
    return map
  }, [playerEvents])

  if (!playerId) return null

  return (
    <div className="animate-slide-in-left flex w-60 shrink-0 flex-col border-l border-border-subtle bg-bg-secondary">
      <div className="flex items-start justify-between border-b border-border-subtle p-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-text-primary">
            {playerName ?? 'Unknown'}
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Player Stats
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="ml-2 shrink-0 rounded p-0.5 text-text-muted transition hover:bg-bg-hover hover:text-text-primary"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>

      <div className="grid grid-cols-3 gap-px border-b border-border-subtle bg-border-subtle">
        {statSummary.map((cat) => (
          <div key={cat.key} className="flex flex-col items-center bg-bg-secondary py-2">
            <span className="font-display text-sm font-bold tabular-nums text-text-primary">
              {cat.value}
            </span>
            <span className="text-[9px] font-medium uppercase tracking-wider text-text-muted">
              {cat.label}
            </span>
          </div>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Your Squares
        </p>

        {(!playerSquares || playerSquares.length === 0) ? (
          <p className="text-xs text-text-muted">No squares for this player.</p>
        ) : (
          <div className="space-y-2">
            {playerSquares.map((sq) => {
              const current = currentValues[sq.stat_type] ?? 0
              const threshold = Number(sq.threshold) || 1
              const marked = sq.marked === true
              const pct = Math.min(1, threshold > 0 ? current / threshold : 0)
              const away = awayLabel(current, threshold, marked)

              return (
                <div
                  key={sq.id}
                  className={`rounded-md border p-2 transition ${
                    marked
                      ? 'border-accent-green/30 bg-accent-green/5'
                      : 'border-border-subtle bg-bg-card'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-[11px] font-medium text-text-primary">
                      {sq.display_text}
                    </span>
                    {marked ? (
                      <Badge variant="success" pop>HIT ✓</Badge>
                    ) : away ? (
                      <Badge variant={threshold - current <= 3 ? 'warning' : 'muted'}>
                        {away}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-bg-hover">
                    <div
                      className={`h-full rounded-full transition-[width] duration-500 ease-out ${progressBarColor(current, threshold, marked)}`}
                      style={{ width: `${Math.round(pct * 100)}%` }}
                    />
                  </div>

                  <div className="mt-0.5 flex justify-between text-[9px] tabular-nums text-text-muted">
                    <span>{current}</span>
                    <span>{threshold}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default memo(PlayerStatsPanel)
