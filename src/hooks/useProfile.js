import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth.jsx'

/**
 * Fetches the current user's profile row (dabs_balance, etc.)
 * and subscribes to realtime UPDATE events so the balance stays live.
 */
export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState(null)

  useEffect(() => {
    if (!user) { setProfile(null); return }

    let cancelled = false

    const load = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('dabs_balance, username, name_color, name_font, equipped_badge, board_skin')
        .eq('id', user.id)
        .maybeSingle()
      if (!cancelled) setProfile(data ?? null)
    }

    load()

    const ch = supabase
      .channel(`profile-dabs-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        (payload) => setProfile((prev) => ({ ...prev, ...payload.new }))
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(ch)
    }
  }, [user?.id])

  return {
    dabsBalance:   profile?.dabs_balance   ?? null,
    username:      profile?.username       ?? null,
    nameColor:     profile?.name_color     ?? null,
    nameFont:      profile?.name_font      ?? 'default',
    equippedBadge: profile?.equipped_badge ?? null,
    boardSkin:     profile?.board_skin     ?? 'default',
  }
}
