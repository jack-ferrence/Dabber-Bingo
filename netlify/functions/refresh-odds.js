/**
 * Netlify scheduled function (runs every 5 minutes via cron).
 *
 * Refreshes player prop odds using sport-level batch fetching.
 * ONE API call per sport covers ALL games — dramatically reducing daily usage.
 *
 * Refresh cadence: 20 minutes per sport (cache TTL).
 * Each 5-min cron run distributes from cache for free; every 4th run fetches fresh.
 *
 * Budget: ~240 calls/day (3 sports × 72 batch fetches + 24 event list calls)
 * Scales to ~400/day with 5 sports (NFL + UFC) — stays within 12k/month target.
 *
 * T-10min: cards locked using actual player count (band-based), unchanged.
 */

import { createClient } from '@supabase/supabase-js'
import { generateOddsBasedCard, getBand } from '../../src/game/oddsCardGenerator.js'
import {
  fetchRoster,
  fetchAllOddsForSport,
  findRoomOddsInBatch,
  matchOddsToRoster,
  reconcileCards,
  trackApiUsage,
  MIN_UNIQUE_CONFLICT_KEYS,
} from './lib/odds-utils.js'

const LOCK_WINDOW_MS  = 10 * 60 * 1000   // T-10 minutes
const BATCH_CACHE_TTL = 20 * 60 * 1000   // 20-minute batch refresh cadence

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
    .eq('status', 'lobby')

  if (roomsErr) {
    console.error('refresh-odds: rooms query failed', roomsErr)
    return { statusCode: 500, body: JSON.stringify({ error: roomsErr.message }) }
  }

  console.log(`refresh-odds: found ${rooms?.length ?? 0} lobby rooms`)

  let refreshed = 0

  // ── Sport-level batch pass ─────────────────────────────────────────────────
  // Group unlocked lobby rooms by sport, then fetch odds for the whole sport
  // in a single API call and distribute to all rooms from that batch.

  const roomsBySport = new Map()
  for (const room of (rooms ?? [])) {
    if (room.cards_locked) continue
    const sport = room.sport || 'nba'
    if (!roomsBySport.has(sport)) roomsBySport.set(sport, [])
    roomsBySport.get(sport).push(room)
  }

  for (const [sport, sportRooms] of roomsBySport) {
    let batchData, fromCache, ageMs
    try {
      ;({ data: batchData, fromCache, ageMs } = await fetchAllOddsForSport(
        sport, apiKey, ctx, supabase, BATCH_CACHE_TTL
      ))
    } catch (err) {
      log.push(`${sport}: batch fetch ERROR — ${err.message}`)
      console.error(`refresh-odds: batch fetch failed for ${sport}:`, err)
      continue
    }

    const cacheStatus = fromCache
      ? `cache (${Math.round(ageMs / 60_000)}min old)`
      : 'fresh'

    if (!batchData || Object.keys(batchData).length === 0) {
      log.push(`${sport}: no odds data in batch [${cacheStatus}]`)
      continue
    }

    log.push(`${sport}: ${Object.keys(batchData).length} events [${cacheStatus}]`)

    for (const room of sportRooms) {
      // Skip if recently updated from the same batch age (avoid redundant DB writes)
      const lastUpdate    = room.odds_updated_at ? new Date(room.odds_updated_at) : null
      const msSinceUpdate = lastUpdate ? now - lastUpdate : Infinity

      // For ready rooms: only update if cache is newer than last update
      if (room.odds_status === 'ready' && fromCache && ageMs != null && lastUpdate) {
        const cacheTs = Date.now() - ageMs
        if (lastUpdate.getTime() >= cacheTs) {
          // Already updated from this cache generation — skip
          continue
        }
      }

      // Don't update rooms that are past T-10 (lock step handles them)
      const startsAt = room.starts_at ? new Date(room.starts_at) : null
      if (startsAt && startsAt - now < LOCK_WINDOW_MS) continue

      const match = findRoomOddsInBatch(room, batchData)
      if (!match) {
        if (room.odds_status === 'pending') {
          log.push(`${room.game_id}: no props in batch — staying pending`)
        }
        continue
      }

      // Store oddsapi_event_id for faster future lookups
      if (!room.oddsapi_event_id && match.eventId) {
        await supabase.from('rooms').update({ oddsapi_event_id: match.eventId }).eq('id', room.id)
      }

      try {
        const roster = await fetchRoster(room.game_id, sport)
        if (roster.length === 0) {
          log.push(`${room.game_id}: no roster — skipping`)
          continue
        }

        const matched    = matchOddsToRoster(match.props, roster)
        const uniqueKeys = new Set(matched.map(p => p.conflict_key))

        if (uniqueKeys.size < MIN_UNIQUE_CONFLICT_KEYS) {
          await supabase.from('rooms').update({
            odds_status:     'insufficient',
            odds_updated_at: now.toISOString(),
          }).eq('id', room.id)
          log.push(`${room.game_id}: ${uniqueKeys.size} combos (need ${MIN_UNIQUE_CONFLICT_KEYS}) — insufficient`)
          continue
        }

        const hadPreviousPool = (room.odds_pool ?? []).length > 0

        await supabase.from('rooms').update({
          odds_pool:       matched,
          odds_status:     'ready',
          odds_updated_at: now.toISOString(),
        }).eq('id', room.id)

        if (hadPreviousPool && !room.cards_locked) {
          const { count } = await supabase
            .from('room_participants')
            .select('*', { count: 'exact', head: true })
            .eq('room_id', room.id)
          await reconcileCards(supabase, room.id, matched, count ?? 5)
        }

        refreshed++
        log.push(`${room.game_id}: ready — ${matched.length} lines [${cacheStatus}]${hadPreviousPool ? ' (reconciled)' : ''}`)
      } catch (err) {
        log.push(`${room.game_id}: ERROR — ${err.message}`)
        console.error(`refresh-odds: failed for game ${room.game_id}:`, err)
      }
    }
  }

  // ── T-10 card lock pass ────────────────────────────────────────────────────
  const { data: lockableRooms } = await supabase
    .from('rooms')
    .select('id, game_id, sport, starts_at, odds_pool')
    .eq('room_type', 'public')
    .eq('status', 'lobby')
    .eq('cards_locked', false)
    .eq('odds_status', 'ready')

  let locked = 0
  for (const lRoom of lockableRooms ?? []) {
    const startsAt = lRoom.starts_at ? new Date(lRoom.starts_at) : null
    if (!startsAt) continue
    const msUntil = startsAt - now
    if (msUntil > LOCK_WINDOW_MS || msUntil < -60_000) continue

    const oddsPool = lRoom.odds_pool ?? []
    if (oddsPool.length < 24) continue

    const { count: playerCount } = await supabase
      .from('room_participants')
      .select('*', { count: 'exact', head: true })
      .eq('room_id', lRoom.id)

    const actualCount = playerCount ?? 0
    if (actualCount === 0) continue

    const band = getBand(actualCount)

    const { data: cards } = await supabase
      .from('cards')
      .select('id, squares, swapped_indices')
      .eq('room_id', lRoom.id)

    let regenCount = 0
    for (const card of cards ?? []) {
      const swappedIndices = new Set((card.swapped_indices ?? []).map(Number))
      const newCard = generateOddsBasedCard(oddsPool, actualCount, lRoom.sport || 'nba')
      if (!newCard) continue

      const finalSquares = newCard.map((sq, i) =>
        swappedIndices.has(i) ? card.squares[i] : sq
      )

      await supabase.from('cards').update({ squares: finalSquares }).eq('id', card.id)
      regenCount++
    }

    await supabase.from('rooms').update({
      cards_locked:          true,
      difficulty_profile:    `band_${band.midpoint}`,
      player_count_at_lock:  actualCount,
      locked_at:             now.toISOString(),
    }).eq('id', lRoom.id)

    locked++
    log.push(`${lRoom.game_id}: locked T-${Math.round(msUntil / 60_000)}min — band ${band.midpoint} (${actualCount} players, ${regenCount} cards regen'd)`)
  }

  await trackApiUsage(supabase, ctx.apiCallsMade, 'refresh-odds')

  console.log('refresh-odds:', log.join(' | '))
  return {
    statusCode: 200,
    body: JSON.stringify({
      refreshed,
      locked,
      apiCallsMade: ctx.apiCallsMade,
      sportsProcessed: roomsBySport.size,
      totalRooms: rooms?.length ?? 0,
      log,
    }),
    headers: { 'Content-Type': 'application/json' },
  }
}
