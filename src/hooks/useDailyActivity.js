import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth.jsx'

/**
 * Fetches today's daily_activities row and daily_streaks for the current user.
 * Call reload() after completing an activity to refresh.
 */
export function useDailyActivity() {
  const { user } = useAuth()
  const [activity, setActivity] = useState(null)
  const [streak, setStreak] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!user) { setActivity(null); setStreak(null); setLoading(false); return }

    const today = new Date().toISOString().slice(0, 10)

    const [actRes, streakRes] = await Promise.all([
      supabase
        .from('daily_activities')
        .select('*')
        .eq('user_id', user.id)
        .eq('activity_date', today)
        .maybeSingle(),
      supabase
        .from('daily_streaks')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
    ])

    setActivity(actRes.data ?? null)
    setStreak(streakRes.data ?? null)
    setLoading(false)
  }, [user])

  useEffect(() => { load() }, [load])

  // Streak multiplier: 1x base, +0.25x per week, caps at 2x
  const currentStreak = streak?.current_streak ?? 0
  const multiplier = Math.min(2, 1 + Math.floor(currentStreak / 7) * 0.25)

  return {
    activity,
    streak,
    loading,
    multiplier,
    reload: load,
  }
}
