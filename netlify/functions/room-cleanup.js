const Sentry = require('@sentry/node')
const { createClient } = require('@supabase/supabase-js')

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
  })
}

/**
 * Netlify scheduled function — runs once daily at 08:00 UTC (midnight Pacific).
 *
 * 1. Force-finish ALL rooms still in lobby/live — every game from today is over
 * 2. Marks any remaining stale live rooms as finished (belt-and-suspenders)
 * 3. Deletes chat_messages and room_participants for rooms finished >7 days ago
 *
 * After step 1, sync-games creates fresh public rooms for the next day's games
 * on its next 5-minute cycle.
 */
exports.handler = async function () {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    const msg = 'room-cleanup: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
    console.error(msg)
    Sentry.captureMessage(msg, 'error')
    return { statusCode: 500, body: JSON.stringify({ error: msg }) }
  }

  const supabase = createClient(url, serviceKey)

  try {
    // ── Step 1: Force-finish all active rooms at midnight ──────────────────
    const { data: forceFinished, error: forceErr } = await supabase
      .from('rooms')
      .update({ status: 'finished' })
      .in('status', ['lobby', 'live'])
      .select('id')

    if (forceErr) {
      console.error('room-cleanup: midnight force-finish failed', forceErr)
      Sentry.captureException(forceErr)
    } else {
      const count = forceFinished?.length ?? 0
      console.log(`room-cleanup: midnight reset — force-finished ${count} room(s)`)

      // Award Dabs for each force-finished room (idempotent RPC — safe if already awarded)
      for (const room of forceFinished ?? []) {
        const { error: dabsErr } = await supabase.rpc('award_game_dabs', { p_room_id: room.id })
        if (dabsErr) {
          console.warn(`room-cleanup: award_game_dabs failed for room ${room.id}`, dabsErr.message)
        }
      }
    }

    // ── Step 2: Stale room cleanup (belt-and-suspenders) ───────────────────
    const { data: staleCount, error: staleErr } = await supabase.rpc('cleanup_stale_rooms')
    if (staleErr) {
      console.error('room-cleanup: cleanup_stale_rooms failed', staleErr)
      Sentry.captureException(staleErr)
    } else {
      console.log(`room-cleanup: marked ${staleCount} stale rooms as finished`)
    }

    // ── Step 3: Purge old room data ────────────────────────────────────────
    const { data: purgeResult, error: purgeErr } = await supabase.rpc('cleanup_old_room_data')
    if (purgeErr) {
      console.error('room-cleanup: cleanup_old_room_data failed', purgeErr)
      Sentry.captureException(purgeErr)
    } else {
      console.log('room-cleanup: purged old data', purgeResult)
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        force_finished: forceFinished?.length ?? 0,
        stale_rooms_finished: staleCount ?? 0,
        purge: purgeResult ?? {},
      }),
      headers: { 'Content-Type': 'application/json' },
    }
  } catch (err) {
    console.error('room-cleanup: error', err)
    Sentry.captureException(err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
