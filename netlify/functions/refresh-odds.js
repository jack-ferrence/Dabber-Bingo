/**
 * Netlify scheduled function (runs every 5 minutes via cron).
 *
 * Refreshes player prop odds via per-event fetching.
 * TheOddsAPI's sport-level /sports/{key}/odds endpoint only supports game markets
 * (h2h, spreads, totals) — player props require the per-event endpoint.
 *
 * Budget control: MAX_ROOMS_PER_RUN limits API calls per invocation.
 * Event list is cached 6h in odds_cache (shared across invocations).
 * Ready rooms are only re-fetched at specific time windows (T-3h, T-1h, T-20min).
 *
 */

import { createClient } from '@supabase/supabase-js'
import {
  fetchRoster,
  fetchOddsForRoom,
  matchOddsToRoster,
  reconcileCards,
  trackApiUsage,
  MIN_UNIQUE_CONFLICT_KEYS,
} from './lib/odds-utils.js'

const MAX_ROOMS_PER_RUN = 3  // Keep low to avoid Netlify function timeouts

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

  // Prioritize: pending first, then soonest start time
  const sortedRooms = [...(rooms ?? [])].sort((a, b) => {
    if (a.odds_status === 'pending' && b.odds_status !== 'pending') return -1
    if (b.odds_status === 'pending' && a.odds_status !== 'pending') return 1
    const aStart = a.starts_at ? new Date(a.starts_at).getTime() : Infinity
    const bStart = b.starts_at ? new Date(b.starts_at).getTime() : Infinity
    return aStart - bStart
  })

  let refreshed = 0
  let processed = 0

  for (const room of sortedRooms) {
    if (processed >= MAX_ROOMS_PER_RUN) {
      log.push(`batch limit (${MAX_ROOMS_PER_RUN}) reached — remaining deferred`)
      break
    }

    // Skip ready rooms outside of refresh windows
    if (room.odds_status === 'ready') {
      const msUntilStart  = room.starts_at ? new Date(room.starts_at) - now : Infinity
      const msSinceUpdate = room.odds_updated_at ? now - new Date(room.odds_updated_at) : Infinity

      let needsRefresh = false
      if      (msUntilStart <= 20 * 60 * 1000  && msSinceUpdate > 15 * 60 * 1000)  needsRefresh = true  // T-20min
      else if (msUntilStart <= 60 * 60 * 1000  && msSinceUpdate > 45 * 60 * 1000)  needsRefresh = true  // T-1h
      else if (msUntilStart <= 3 * 60 * 60 * 1000 && msSinceUpdate > 2 * 60 * 60 * 1000) needsRefresh = true  // T-3h

      if (!needsRefresh) continue
    }

    // For pending/insufficient: skip rooms more than 24h away
    if (room.odds_status === 'pending' || room.odds_status === 'insufficient') {
      const msUntilStart = room.starts_at ? new Date(room.starts_at) - now : Infinity
      if (msUntilStart > 24 * 60 * 60 * 1000) continue
    }

    processed++
    const sport = room.sport || 'nba'
    console.log(`refresh-odds: processing ${room.game_id} (${room.name}) [${sport}]`)

    try {
      const roster = await fetchRoster(room.game_id, sport)
      if (roster.length === 0) {
        log.push(`${room.game_id}: no roster — skipping`)
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

  await trackApiUsage(supabase, ctx.apiCallsMade, 'refresh-odds')

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
