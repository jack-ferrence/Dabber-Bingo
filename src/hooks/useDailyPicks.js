import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth.jsx'

function tomorrowDateStr() {
  const d = new Date(Date.now() + 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function yesterdayDateStr() {
  const d = new Date(Date.now() - 86_400_000)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Selects 3 primetime games for tomorrow, diversified across sports.
 * Also fetches user's existing picks + yesterday's results.
 */
export function useDailyPicks() {
  const { user } = useAuth()
  const [games, setGames] = useState([])
  const [userPicks, setUserPicks] = useState([])
  const [yesterdayPicks, setYesterdayPicks] = useState([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setLoading(false); return }

    const tomorrow = tomorrowDateStr()
    const yesterday = yesterdayDateStr()

    // Get tomorrow's start/end timestamps
    const tomorrowStart = `${tomorrow}T00:00:00Z`
    const tomorrowEnd = `${tomorrow}T23:59:59Z`

    const [roomsRes, picksRes, yesterdayRes] = await Promise.all([
      supabase
        .from('rooms_with_counts')
        .select('*')
        .eq('room_type', 'public')
        .eq('status', 'lobby')
        .gte('starts_at', tomorrowStart)
        .lte('starts_at', tomorrowEnd)
        .order('starts_at', { ascending: false }),
      supabase
        .from('daily_picks')
        .select('*')
        .eq('user_id', user.id)
        .eq('pick_date', tomorrow),
      supabase
        .from('daily_picks')
        .select('*, rooms:room_id(name, sport, home_score, away_score, status)')
        .eq('user_id', user.id)
        .eq('pick_date', yesterday),
    ])

    const rooms = roomsRes.data ?? []
    setUserPicks(picksRes.data ?? [])
    setYesterdayPicks(yesterdayRes.data ?? [])

    // Select 3 primetime games diversified across sports
    const selected = selectPrimetimeGames(rooms, 3)
    setGames(selected)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  return { games, userPicks, yesterdayPicks, loading, reload: load }
}

/**
 * Picks N primetime games diversified across sports.
 * Primetime = latest start times (evening games).
 */
function selectPrimetimeGames(rooms, count) {
  if (rooms.length <= count) return rooms

  // Group by sport
  const bySport = {}
  for (const r of rooms) {
    const sport = r.sport ?? 'nba'
    if (!bySport[sport]) bySport[sport] = []
    bySport[sport].push(r)
  }

  // Sort each sport's games by start time desc (primetime first)
  for (const sport of Object.keys(bySport)) {
    bySport[sport].sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
  }

  const selected = []
  const sports = Object.keys(bySport)

  // Round-robin: pick one primetime game from each sport
  for (const sport of sports) {
    if (selected.length >= count) break
    if (bySport[sport].length > 0) {
      selected.push(bySport[sport].shift())
    }
  }

  // Fill remaining from the sport with the most games
  if (selected.length < count) {
    const remaining = sports
      .flatMap((s) => bySport[s])
      .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at))
    for (const r of remaining) {
      if (selected.length >= count) break
      if (!selected.find((s) => s.id === r.id)) {
        selected.push(r)
      }
    }
  }

  return selected
}
