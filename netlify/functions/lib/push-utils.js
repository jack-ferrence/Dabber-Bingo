import { sendPush } from './apns.js'

export async function notifyUsers(supabase, userIds, { title, body, data = {} }) {
  try {
    if (!userIds || userIds.length === 0) return { sent: 0, expired: 0 }

    const { data: tokens, error } = await supabase
      .from('push_tokens')
      .select('id, user_id, token')
      .in('user_id', userIds)

    if (error || !tokens || tokens.length === 0) {
      if (error) console.error('[push-utils] token query error:', error.message)
      return { sent: 0, expired: 0 }
    }

    const results = await Promise.allSettled(
      tokens.map(async (t) => {
        const result = await sendPush(t.token, { title, body, data })
        return { id: t.id, ...result }
      })
    )

    let sent = 0
    let expired = 0
    const expiredIds = []

    for (const r of results) {
      if (r.status !== 'fulfilled') continue
      if (r.value.success) {
        sent++
      } else if (r.value.expired) {
        expired++
        expiredIds.push(r.value.id)
      }
    }

    if (expiredIds.length > 0) {
      const { error: delError } = await supabase
        .from('push_tokens')
        .delete()
        .in('id', expiredIds)
      if (delError) console.error('[push-utils] expired token cleanup error:', delError.message)
    }

    return { sent, expired }
  } catch (err) {
    console.error('[push-utils] notifyUsers error:', err.message)
    return { sent: 0, expired: 0 }
  }
}

export async function notifyGamePlayers(supabase, roomId, { title, body, data = {} }, options = {}) {
  try {
    const { respectPrefs = true, prefField = null, excludeUserIds = [] } = options

    const { data: participants, error } = await supabase
      .from('room_participants')
      .select('user_id')
      .eq('room_id', roomId)

    if (error || !participants || participants.length === 0) {
      if (error) console.error('[push-utils] participants query error:', error.message)
      return { sent: 0, expired: 0 }
    }

    let userIds = participants.map((p) => p.user_id)

    if (excludeUserIds.length > 0) {
      const excluded = new Set(excludeUserIds)
      userIds = userIds.filter((id) => !excluded.has(id))
    }

    if (userIds.length === 0) return { sent: 0, expired: 0 }

    if (respectPrefs && prefField) {
      const { data: prefs, error: prefError } = await supabase
        .from('profiles')
        .select('id')
        .in('id', userIds)
        .eq(prefField, true)

      if (prefError) {
        console.error('[push-utils] prefs query error:', prefError.message)
      } else if (prefs) {
        const allowedIds = new Set(prefs.map((p) => p.id))
        userIds = userIds.filter((id) => allowedIds.has(id))
      }
    }

    return await notifyUsers(supabase, userIds, { title, body, data })
  } catch (err) {
    console.error('[push-utils] notifyGamePlayers error:', err.message)
    return { sent: 0, expired: 0 }
  }
}

export async function notifySpecificUsers(supabase, userIdTitleBodyArray) {
  try {
    if (!userIdTitleBodyArray || userIdTitleBodyArray.length === 0) return { sent: 0, expired: 0 }

    // Group by title+body to batch sends
    const groups = new Map()
    for (const item of userIdTitleBodyArray) {
      const key = `${item.title}\0${item.body}`
      if (!groups.has(key)) {
        groups.set(key, { title: item.title, body: item.body, data: item.data || {}, userIds: [] })
      }
      groups.get(key).userIds.push(item.userId)
    }

    let totalSent = 0
    let totalExpired = 0

    const results = await Promise.allSettled(
      Array.from(groups.values()).map((g) =>
        notifyUsers(supabase, g.userIds, { title: g.title, body: g.body, data: g.data })
      )
    )

    for (const r of results) {
      if (r.status === 'fulfilled') {
        totalSent += r.value.sent
        totalExpired += r.value.expired
      }
    }

    return { sent: totalSent, expired: totalExpired }
  } catch (err) {
    console.error('[push-utils] notifySpecificUsers error:', err.message)
    return { sent: 0, expired: 0 }
  }
}
