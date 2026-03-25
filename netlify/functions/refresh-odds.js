/**
 * Netlify scheduled function (runs every 5 minutes via cron).
 *
 * Refreshes player prop odds for lobby rooms at fixed windows before tipoff.
 * Odds are fetched ONCE at room creation (via sync-games); this function
 * only picks them up at three specific windows:
 *
 *   T-3h   : catch early line moves after opening
 *   T-1h   : catch injury reports and late scratches
 *   T-15min: final snapshot before T-10 card lock
 *
 * Each room gets at most 4 API calls total:
 *   1 at creation + 3 fixed windows = 4 per room per day
 *
 * At T-10min: cards are regenerated using the actual player count (band-based)
 * and the room is marked cards_locked=true — no more refreshes after that.
 */

import { createClient } from '@supabase/supabase-js'
import { generateOddsBasedCard, getBand } from '../../src/game/oddsCardGenerator.js'
import {
  fetchRoster,
  fetchOddsForRoom,
  matchOddsToRoster,
  reconcileCards,
  MIN_UNIQUE_CONFLICT_KEYS,
} from './lib/odds-utils.js'

const LOCK_WINDOW_MS    = 10 * 60 * 1000   // T-10 minutes
const MAX_ROOMS_PER_RUN = 10

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

  // Invocation-scoped state — fresh context per call, shared across rooms in this run
  const ctx = { eventListCache: new Map(), apiCallsMade: 0 }

  const supabase = createClient(url, serviceKey)
  const now = new Date()
  const log = []

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

  // Prioritize: rooms missing odds first, then soonest start time
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
      log.push(`batch limit (${MAX_ROOMS_PER_RUN}) reached — remaining rooms deferred to next cycle`)
      break
    }

    // Already locked — no more odds updates
    if (room.cards_locked) continue

    const startsAt      = room.starts_at ? new Date(room.starts_at) : null
    const msUntilStart  = startsAt ? startsAt - now : Infinity
    const lastUpdate    = room.odds_updated_at ? new Date(room.odds_updated_at) : null
    const msSinceUpdate = lastUpdate ? now - lastUpdate : Infinity

    // ── Fixed refresh windows ───────────────────────────────────────────────
    // sync-games already fetched odds at room creation; we only update at
    // three specific windows to minimize API calls.
    let needsRefresh = false
    let refreshReason = ''

    if (room.odds_status === 'pending' || room.odds_status === 'insufficient') {
      // Never got odds — retry within 4h of tipoff (odds may not exist further out)
      if (msUntilStart <= 4 * 60 * 60 * 1000) {
        needsRefresh = true
        refreshReason = 'retry_missing'
      }
    } else if (room.odds_status === 'ready') {
      // T-3h window: game is 2.5h–3.5h out, last updated > 2h ago
      if (msUntilStart <= 3.5 * 60 * 60 * 1000 && msUntilStart > 2.5 * 60 * 60 * 1000) {
        if (msSinceUpdate > 2 * 60 * 60 * 1000) {
          needsRefresh = true
          refreshReason = 'window_3h'
        }
      }
      // T-1h window: game is 45min–1.25h out, last updated > 1.5h ago
      else if (msUntilStart <= 1.25 * 60 * 60 * 1000 && msUntilStart > 45 * 60 * 1000) {
        if (msSinceUpdate > 1.5 * 60 * 60 * 1000) {
          needsRefresh = true
          refreshReason = 'window_1h'
        }
      }
      // T-15min window: game is 10–20min out, last updated > 30min ago
      else if (msUntilStart <= 20 * 60 * 1000 && msUntilStart > LOCK_WINDOW_MS) {
        if (msSinceUpdate > 30 * 60 * 1000) {
          needsRefresh = true
          refreshReason = 'window_15min'
        }
      }
      // After T-10: no more refreshes — lock step handles this separately
    }

    if (!needsRefresh) continue

    processed++
    console.log(`refresh-odds: processing ${room.game_id} (${room.name}) — status=${room.odds_status} reason=${refreshReason}`)

    try {
      const roster = await fetchRoster(room.game_id, room.sport || 'nba')
      console.log(`refresh-odds: ${room.game_id} — roster: ${roster.length} players`)
      if (roster.length === 0) {
        log.push(`${room.game_id}: no roster — skipping`)
        continue
      }

      const { props, reason, eventId } = await fetchOddsForRoom(room, apiKey, ctx, supabase)
      console.log(`refresh-odds: ${room.game_id} — raw props: ${props.length}${reason ? ` (${reason})` : ''}`)

      if (props.length === 0) {
        await supabase
          .from('rooms')
          .update({ odds_status: 'insufficient', odds_updated_at: now.toISOString() })
          .eq('id', room.id)
        log.push(`${room.game_id}: insufficient odds (${reason})`)
        continue
      }

      if (eventId && !room.oddsapi_event_id) {
        await supabase.from('rooms').update({ oddsapi_event_id: eventId }).eq('id', room.id)
      }

      const matched = matchOddsToRoster(props, roster)
      const uniqueKeys = new Set(matched.map(p => p.conflict_key))
      console.log(`refresh-odds: ${room.game_id} — matched: ${matched.length} lines, ${uniqueKeys.size} unique player+stat combos`)

      if (uniqueKeys.size < MIN_UNIQUE_CONFLICT_KEYS) {
        await supabase
          .from('rooms')
          .update({ odds_status: 'insufficient', odds_updated_at: now.toISOString() })
          .eq('id', room.id)
        log.push(`${room.game_id}: ${uniqueKeys.size} unique combos (need ${MIN_UNIQUE_CONFLICT_KEYS})`)
        continue
      }

      const hadPreviousPool = (room.odds_pool ?? []).length > 0

      await supabase
        .from('rooms')
        .update({ odds_pool: matched, odds_status: 'ready', odds_updated_at: now.toISOString() })
        .eq('id', room.id)

      // Reconcile only if this is an update (not first-time) and room isn't locked
      if (hadPreviousPool && !room.cards_locked) {
        const { count: playerCount } = await supabase
          .from('room_participants')
          .select('*', { count: 'exact', head: true })
          .eq('room_id', room.id)
        await reconcileCards(supabase, room.id, matched, playerCount ?? 5)
      }

      refreshed++
      log.push(`${room.game_id}: ready — ${matched.length} lines, ${uniqueKeys.size} combos [${refreshReason}]${hadPreviousPool ? ' (reconciled)' : ''}`)
    } catch (err) {
      log.push(`${room.game_id}: ERROR — ${err.message}`)
      console.error(`refresh-odds: failed for game ${room.game_id}:`, err)
    }
  }

  // ── T-10 card lock pass ────────────────────────────────────────────────────
  // Find lobby rooms in the T-10 window that haven't been locked yet.
  // Regenerate all cards using the band for the actual player count,
  // preserving any squares the player paid to swap.
  const { data: lockableRooms } = await supabase
    .from('rooms')
    .select('id, game_id, starts_at, odds_pool')
    .eq('room_type', 'public')
    .eq('status', 'lobby')
    .eq('cards_locked', false)
    .eq('odds_status', 'ready')

  let locked = 0
  for (const lRoom of lockableRooms ?? []) {
    const startsAt = lRoom.starts_at ? new Date(lRoom.starts_at) : null
    if (!startsAt) continue
    const msUntil = startsAt - now
    // Lock window: T-10 down to T+1 min (small grace for the exact boundary)
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
      const newCard = generateOddsBasedCard(oddsPool, actualCount)
      if (!newCard) continue

      const finalSquares = newCard.map((sq, i) =>
        swappedIndices.has(i) ? card.squares[i] : sq
      )

      await supabase.from('cards').update({ squares: finalSquares }).eq('id', card.id)
      regenCount++
    }

    await supabase
      .from('rooms')
      .update({
        cards_locked: true,
        difficulty_profile: `band_${band.midpoint}`,
        player_count_at_lock: actualCount,
        locked_at: now.toISOString(),
      })
      .eq('id', lRoom.id)

    locked++
    log.push(`${lRoom.game_id}: locked T-${Math.round(msUntil / 60_000)}min — band ${band.midpoint} (${actualCount} players, ${regenCount} cards regen'd)`)
  }

  console.log('refresh-odds:', log.join(' | '))
  return {
    statusCode: 200,
    body: JSON.stringify({ refreshed, processed, locked, apiCallsMade: ctx.apiCallsMade, total: rooms?.length ?? 0, log }),
    headers: { 'Content-Type': 'application/json' },
  }
}
