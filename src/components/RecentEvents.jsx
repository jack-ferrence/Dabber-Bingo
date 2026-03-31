import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// Keys are ESPN numeric player IDs (the player_id stored in stat_events).
const PLAYER_NAMES = {
  '2544':    'LeBron James',
  '3975':    'Stephen Curry',
  '3032977': 'Giannis Antetokounmpo',
  '3112335': 'Nikola Jokić',
  '3202':    'Kevin Durant',
  '4065648': 'Jayson Tatum',
  '3945274': 'Luka Dončić',
  '3059318': 'Joel Embiid',
  '3136193': 'Devin Booker',
  '3908809': 'Donovan Mitchell',
}

function statTypeLabel(statType) {
  if (statType.startsWith('points_'))  return `${statType.split('_')[1]}+ PTS`
  if (statType.startsWith('rebound_')) return `${statType.split('_')[1]}+ REB`
  if (statType.startsWith('assist_'))  return `${statType.split('_')[1]}+ AST`
  if (statType === 'three_pointer') return '1+ 3PM'
  if (statType === 'steal')         return '1+ STL'
  if (statType === 'block')         return '1+ BLK'
  return statType
}

const MAX_EVENTS = 5

function RecentEvents({ gameId }) {
  const [events, setEvents] = useState([])

  useEffect(() => {
    if (!gameId) return

    const fetchInitial = async () => {
      const { data } = await supabase
        .from('stat_events')
        .select('id, player_id, stat_type, value, fired_at')
        .eq('game_id', gameId)
        .order('fired_at', { ascending: false })
        .limit(MAX_EVENTS)
      setEvents(data ?? [])
    }

    fetchInitial()

    const channel = supabase
      .channel(`stat_events:${gameId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stat_events',
          filter: `game_id=eq.${gameId}`,
        },
        (payload) => {
          const row = payload.new
          if (row?.id)
            setEvents((prev) => [row, ...prev].slice(0, MAX_EVENTS))
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gameId])

  if (!gameId) return null

  return (
    <div>
      <h2 style={{ fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>
        RECENT EVENTS
      </h2>
      <ul className="mt-2 space-y-1.5 overflow-hidden">
        {events.length === 0 ? (
          <li style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>No events yet.</li>
        ) : (
          events.map((ev) => (
            <li
              key={ev.id}
              className="animate-in-from-top"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 6, padding: '6px 10px', fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'rgba(255,255,255,0.7)' }}
            >
              <span style={{ fontWeight: 600, color: '#ff6b35' }}>
                {PLAYER_NAMES[ev.player_id] ?? ev.player_id}
              </span>
              <span style={{ color: 'rgba(255,255,255,0.4)' }}> — </span>
              <span>{statTypeLabel(ev.stat_type)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  )
}

export default RecentEvents
