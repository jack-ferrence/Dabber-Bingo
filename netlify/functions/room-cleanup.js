const Sentry = require('@sentry/node')
const { createClient } = require('@supabase/supabase-js')

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
  })
}

/**
 * Netlify scheduled function — heartbeat every 30 minutes.
 *
 * Only acts when ALL of the following are true:
 *   1. No rooms are in lobby or live status
 *   2. The last finished room was updated 30+ minutes ago
 *
 * When conditions are met:
 *   - Deletes cards, room_participants, stat_events, and the rooms themselves
 *   - Clears the odds_cache
 *
 * This lets finished rooms stay visible in the lobby until 30 minutes after
 * the last game of the day, then wipes the slate clean for tomorrow.
 */
exports.handler = async function () {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing env vars' }) }
  }

  const supabase = createClient(url, serviceKey)
  const log = []

  // ── Step 1: Check if any games are still active ──
  const { count: activeCount, error: activeErr } = await supabase
    .from('rooms')
    .select('*', { count: 'exact', head: true })
    .in('status', ['lobby', 'live'])

  if (activeErr) {
    console.error('room-cleanup: active count failed', activeErr)
    Sentry.captureException(activeErr)
    return { statusCode: 500, body: JSON.stringify({ error: activeErr.message }) }
  }

  if (activeCount > 0) {
    log.push(`${activeCount} active room(s) — skipping cleanup`)
    console.log('room-cleanup:', log.join(' | '))
    return {
      statusCode: 200,
      body: JSON.stringify({ cleaned: false, reason: 'active_games', activeCount, log }),
      headers: { 'Content-Type': 'application/json' },
    }
  }

  // ── Step 2: Find when the last game finished ──
  const { data: lastFinished, error: lastErr } = await supabase
    .from('rooms')
    .select('updated_at')
    .eq('status', 'finished')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (lastErr) {
    console.error('room-cleanup: last finished query failed', lastErr)
    Sentry.captureException(lastErr)
    return { statusCode: 500, body: JSON.stringify({ error: lastErr.message }) }
  }

  if (!lastFinished) {
    log.push('no finished rooms found — nothing to clean')
    console.log('room-cleanup:', log.join(' | '))
    return {
      statusCode: 200,
      body: JSON.stringify({ cleaned: false, reason: 'no_finished_rooms', log }),
      headers: { 'Content-Type': 'application/json' },
    }
  }

  const msSinceLastGame = Date.now() - new Date(lastFinished.updated_at).getTime()
  const minsSince = Math.round(msSinceLastGame / 60000)

  if (msSinceLastGame < 30 * 60 * 1000) {
    log.push(`last game finished ${minsSince}m ago — waiting for 30m cooldown`)
    console.log('room-cleanup:', log.join(' | '))
    return {
      statusCode: 200,
      body: JSON.stringify({ cleaned: false, reason: 'cooldown', minsSinceLastGame: minsSince, log }),
      headers: { 'Content-Type': 'application/json' },
    }
  }

  // ── Step 3: All games done, 30min passed — purge finished rooms ──
  log.push(`last game finished ${minsSince}m ago — cleaning up`)

  const { data: finishedRooms } = await supabase
    .from('rooms')
    .select('id, game_id')
    .eq('status', 'finished')

  const finishedIds = (finishedRooms ?? []).map(r => r.id)

  if (finishedIds.length > 0) {
    // Delete cards
    const { error: cardsErr } = await supabase
      .from('cards')
      .delete()
      .in('room_id', finishedIds)
    if (cardsErr) log.push(`cards delete error: ${cardsErr.message}`)
    else log.push(`deleted cards for ${finishedIds.length} rooms`)

    // Delete room participants
    const { error: partErr } = await supabase
      .from('room_participants')
      .delete()
      .in('room_id', finishedIds)
    if (partErr) log.push(`participants delete error: ${partErr.message}`)
    else log.push('deleted room_participants')

    // Delete stat events for these games
    const uniqueGameIds = [...new Set((finishedRooms ?? []).map(r => r.game_id).filter(Boolean))]
    if (uniqueGameIds.length > 0) {
      const { error: statsErr } = await supabase
        .from('stat_events')
        .delete()
        .in('game_id', uniqueGameIds)
      if (statsErr) log.push(`stat_events delete error: ${statsErr.message}`)
      else log.push(`deleted stat_events for ${uniqueGameIds.length} games`)
    }

    // Delete the finished rooms themselves
    const { error: roomsErr } = await supabase
      .from('rooms')
      .delete()
      .in('id', finishedIds)
    if (roomsErr) log.push(`rooms delete error: ${roomsErr.message}`)
    else log.push(`deleted ${finishedIds.length} finished rooms`)

    // Clear odds cache
    const { error: cacheErr } = await supabase
      .from('odds_cache')
      .delete()
      .neq('key', 'placeholder')
    if (!cacheErr) log.push('cleared odds_cache')
  }

  console.log('room-cleanup:', log.join(' | '))
  return {
    statusCode: 200,
    body: JSON.stringify({ cleaned: true, roomsPurged: finishedIds.length, log }),
    headers: { 'Content-Type': 'application/json' },
  }
}
