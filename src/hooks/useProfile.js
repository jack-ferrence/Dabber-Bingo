import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth.jsx'

const CACHE_KEY = 'dobber_profile'

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) } catch { return null }
}
function writeCache(data) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)) } catch { /* ignore */ }
}

/**
 * Fetches the current user's profile row (dobs_balance/dabs_balance, etc.)
 * and subscribes to realtime UPDATE events so the balance stays live.
 * Initializes from localStorage so boardSkin is available on first render (no flash).
 */
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(() => readCache())

  useEffect(() => {
    if (!user) { setProfile(null); return }

    let cancelled = false

    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('dabs_balance, username, name_color, name_font, equipped_badge, board_skin, daub_style, favorite_teams')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled && data) {
        setProfile(data)
        writeCache(data)
      }
    }

    load()

    const ch = supabase
      .channel(`profile-dobs-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => setProfile((prev) => {
          const next = { ...prev, ...payload.new }
          writeCache(next)
          return next
        })
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(ch)
    }
  }, [user?.id])

  return {
    dobsBalance:   profile?.dabs_balance   ?? null,
    username:      profile?.username       ?? null,
    nameColor:     profile?.name_color     ?? null,
    nameFont:      profile?.name_font      ?? 'default',
    equippedBadge: profile?.equipped_badge ?? null,
    boardSkin:     profile?.board_skin     ?? 'default',
    daubStyle:     profile?.daub_style     ?? 'classic',
    favoriteTeams: profile?.favorite_teams ?? {},
  }
}
