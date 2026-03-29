/**
 * Netlify scheduled function (runs every 5 minutes via cron).
 *
 * Refreshes player prop odds via per-event fetching (/events/{eventId}/odds).
 * TheOddsAPI's sport-level endpoint does NOT support player props.
 *
 * Two-fetch strategy — max 2 API calls per game:
 *   Fetch 1: Keep retrying (every 15 min) until odds are available → status=ready
 *   Fetch 2: One final refresh at T-1h to catch late scratches/line moves
 *
 * Budget: ~78 calls/day (~2,340/month) — 13% of 20k limit.
 *
 * Queue fairness:
 *   - Rooms interleaved by sport so one sport can't starve others
 *   - All skip checks happen BEFORE incrementing processed (skips are free)
 *   - Roster failures set odds_updated_at so they respect the 15min cooldown
 */

import { createClient } from '@supabase/supabase-js'
import {
  fetchRoster,
  fetchOddsForRoom,
  matchOddsToRoster,
  reconcileCards,
  MIN_UNIQUE_CONFLICT_KEYS,
} from './lib/odds-utils.js'

const MAX_ROOMS_PER_RUN = 6  // Safe with proper cooldowns; ~2 per sport per run

/**
 * Round-robin interleave: pick one item from each bucket in rotation.
 * Preserves per-bucket order (first item of each bucket, then second, etc.)
 */
function interleaveByKey(arr, keyFn) {
  const buckets = {}
  for (const item of arr) {
    const key = keyFn(item)
    if (!buckets[key]) buckets[key] = []
    buckets[key].push(item)
  }
  const keys = Object.keys(buckets)
  const result = []
  let added = true
  while (added) {
    added = false
    for (const key of keys) {
      if (buckets[key].length > 0) {
        result.push(buckets[key].shift())
        added = true
      }
    }
  }
  return result
}

export async function handler() {
  const url        = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey     = process.env.ODDS_API_KEY

  console.log('refresh-odds: starting —', {
    hasUrl: !!url,
    hasServiceKey: !!serviceKey,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 8) + '...' : 'none',
  })

  if (!url || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE env vars' }) }
  }
  if (!apiKey) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_api_key' }) }
  }

  const ctx      = { eventListCache: new Map(), apiCallsMade: 0 }
  const supabase = createClient(url, serviceKey)
  const now      = new Date()
  const log      = []

  const { data: rooms, error: roomsErr } = await supabase
    .from('rooms')
    .select('*')
    .eq('room_type', 'public')
    .in('status', ['lobby', 'live'])

  if (roomsErr) {
    console.error('refresh-odds: rooms query failed', roomsErr)
    return { statusCode: 500, body: JSON.stringify({ error: roomsErr.message }) }
  }

  console.log(`refresh-odds: found ${rooms?.length ?? 0} rooms`)

  // Sort within each sport: pending first, then soonest start
  const sortedRooms = [...(rooms ?? [])].sort((a, b) => {
    if (a.odds_status === 'pending' && b.odds_status !== 'pending') return -1
    if (b.odds_status === 'pending' && a.odds_status !== 'pending') return 1
    const aStart = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
    const bStart = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
    return aStart - bStart
  })

  // Interleave by sport so no single sport starves the queue
  const interleavedRooms = interleaveByKey(sortedRooms, r => r.sport || 'nba')

  let refreshed = 0
  let processed = 0

  for (const room of interleavedRooms) {
    // ── Skip checks — BEFORE incrementing processed (skips are free) ──────────

    const msUntilStart  = room.starts_at ? new Date(room.starts_at) - now : Infinity
    const msSinceUpdate = room.odds_updated_at ? now - new Date(room.odds_updated_at) : Infinity

    if (room.odds_status === 'ready') {
      // Already have odds — only one more fetch at T-1h to catch late scratches
      const inT1hWindow             = msUntilStart <= 65 * 60 * 1000 && msUntilStart > 0
      const notYetRefreshedInWindow = msSinceUpdate > 55 * 60 * 1000
      if (!inT1hWindow || !notYetRefreshedInWindow) continue
    }

    if (room.odds_status === 'pending' || room.odds_status === 'insufficient') {
      // No odds yet — retry every 15 min; skip if game is >24h away
      if (msUntilStart > 24 * 60 * 60 * 1000) continue
      if (msSinceUpdate < 15 * 60 * 1000) continue
    }

    // ── Batch limit — checked after skips so free-skips don't block the queue ──
    if (processed >= MAX_ROOMS_PER_RUN) {
      log.push(`batch limit (${MAX_ROOMS_PER_RUN}) reached — remaining deferred`)
      break
    }
    processed++

    const sport = room.sport || 'nba'
    console.log(`refresh-odds: processing ${room.game_id} (${room.name}) [${sport}]`)

    try {
      const roster = await fetchRoster(room.game_id, sport)
      if (roster.length === 0) {
        // Set odds_updated_at so the 15-min cooldown applies — prevents starving the queue
        await supabase.from('rooms').update({ odds_updated_at: now.toISOString() }).eq('id', room.id)
        log.push(`${room.game_id}: no roster — cooldown set`)
        continue
      }

      const { props, reason, eventId } = await fetchOddsForRoom(room, apiKey, ctx, supabase)

      if (props.length === 0) {
        await supabase.from('rooms').update({
          odds_status:     'insufficient',
          odds_updated_at: now.toISOString(),
        }).eq('id', room.id)
        log.push(`${room.game_id}: insufficient (${reason || 'no props'})`)
        continue
      }

      if (eventId && !room.oddsapi_event_id) {
        await supabase.from('rooms').update({ oddsapi_event_id: eventId }).eq('id', room.id)
      }

      const matched    = matchOddsToRoster(props, roster)
      const uniqueKeys = new Set(matched.map(p => p.conflict_key))

      if (uniqueKeys.size < MIN_UNIQUE_CONFLICT_KEYS) {
        await supabase.from('rooms').update({
          odds_status:     'insufficient',
          odds_updated_at: now.toISOString(),
        }).eq('id', room.id)
        log.push(`${room.game_id}: ${uniqueKeys.size} unique combos (need ${MIN_UNIQUE_CONFLICT_KEYS})`)
        continue
      }

      const hadPreviousPool = (room.odds_pool ?? []).length > 0

      await supabase.from('rooms').update({
        odds_pool:       matched,
        odds_status:     'ready',
        odds_updated_at: now.toISOString(),
      }).eq('id', room.id)

      if (hadPreviousPool) {
        const { count } = await supabase
          .from('room_participants')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
        await reconcileCards(supabase, room.id, matched, count ?? 5)
      }

      refreshed++
      log.push(`${room.game_id}: ready — ${matched.length} lines, ${uniqueKeys.size} combos`)
    } catch (err) {
      log.push(`${room.game_id}: ERROR — ${err.message}`)
      console.error(`refresh-odds: failed for ${room.game_id}:`, err)
    }
  }

  console.log('refresh-odds:', log.join(' | '))
  return {
    statusCode: 200,
    body: JSON.stringify({
      refreshed,
      processed,
      apiCallsMade: ctx.apiCallsMade,
      total: rooms?.length ?? 0,
      log,
    }),
    headers: { 'Content-Type': 'application/json' },
  }
}
