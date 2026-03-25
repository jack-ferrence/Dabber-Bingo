import * as Sentry from '@sentry/node'
import { createClient } from '@supabase/supabase-js'
import { getStatsForGame, fetchLiveEspnGames } from '../../src/lib/statsProvider.js'

const LOCK_KEY = 'poll-stats'
const LOCK_TTL_SECONDS = 50

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'production',
    tracesSampleRate: 0.2,
  })
}

/**
 * Netlify scheduled function (runs every minute via cron).
 *
 * Flow:
 *   1. Acquire polling lock (skip if another invocation holds it)
 *   2. Fetch ESPN scoreboard once → build gameId→status map
 *   3. Auto-start: lobby public rooms whose ESPN game is STATUS_IN_PROGRESS
 *   4. Query live rooms for active game_ids
 *   5. Fetch stats from ESPN or mock provider
 *   6. Upsert stat_events (ON CONFLICT DO NOTHING via 23505)
 *   7. Run mark_squares_for_event for each new event
 *   8. Auto-finish: rooms whose ESPN game is STATUS_FINAL
 *   9. Release lock
 *
 * Env vars (set in Netlify dashboard):
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (server-side only)
 *   STATS_SOURCE              — "espn" | "mock" (default: "espn")
 *   SENTRY_DSN                — Sentry DSN for error monitoring
 */
export async function handler() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const statsSource = (process.env.STATS_SOURCE || 'espn').toLowerCase()

  const missing = []
  if (!url) missing.push('SUPABASE_URL')
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')

  if (missing.length > 0) {
    const msg = `poll-stats: Missing required env var(s): ${missing.join(', ')}. Set them in the Netlify dashboard under Site Settings > Environment Variables.`
    console.error(msg)
    Sentry.captureMessage(msg, 'error')
    return {
      statusCode: 500,
      body: JSON.stringify({ error: msg }),
      headers: { 'Content-Type': 'application/json' },
    }
  }

  const supabase = createClient(url, serviceKey)
  const log = []

  // ── Step 1: Acquire lock ──
  try {
    const { data: acquired, error: lockErr } = await supabase.rpc('acquire_polling_lock', {
      p_key: LOCK_KEY,
      p_owner: `netlify-${Date.now()}`,
      p_ttl_seconds: LOCK_TTL_SECONDS,
    })

    if (lockErr) {
      console.warn('poll-stats: lock RPC failed, proceeding anyway', lockErr.message)
    } else if (!acquired) {
      console.log('poll-stats: skipped — another invocation holds the lock')
      return {
        statusCode: 200,
        body: JSON.stringify({ skipped: true, reason: 'lock held' }),
        headers: { 'Content-Type': 'application/json' },
      }
    }
  } catch (lockCatchErr) {
    console.warn('poll-stats: lock check failed, proceeding anyway', lockCatchErr.message)
  }

  try {
    // ── Step 2: Fetch ESPN scoreboards (NBA + NCAA) → gameId status map ──
    // Used for both auto-start and auto-finish so we only hit ESPN once per run.
    const espnStatusMap = new Map() // gameId (string) → ESPN status name
    try {
      const [nbaGames, ncaaGames] = await Promise.allSettled([
        fetchLiveEspnGames('nba'),
        fetchLiveEspnGames('ncaa'),
      ])
      let total = 0
      for (const result of [nbaGames, ncaaGames]) {
        if (result.status === 'fulfilled') {
          for (const g of result.value) {
            espnStatusMap.set(g.id, g.status)
          }
          total += result.value.length
        }
      }
      log.push(`ESPN scoreboard: ${total} game(s) (NBA + NCAA)`)
    } catch (err) {
      // Non-fatal: auto-start/finish will be skipped this run, stat polling continues
      log.push(`ESPN scoreboard fetch failed: ${err.message}`)
      console.warn('poll-stats: ESPN scoreboard fetch failed', err.message)
    }

    // ── Step 3: Auto-start public lobby rooms whose game has begun ──
    let autoStarted = 0
    try {
      const { data: lobbyPublicRooms, error: lobbyErr } = await supabase
        .from('rooms')
        .select('id, game_id')
        .eq('status', 'lobby')
        .eq('room_type', 'public')

      if (lobbyErr) {
        log.push(`auto-start query failed: ${lobbyErr.message}`)
      } else {
        for (const room of lobbyPublicRooms ?? []) {
          if (espnStatusMap.get(room.game_id) === 'STATUS_IN_PROGRESS') {
            const { error: startErr } = await supabase
              .from('rooms')
              .update({ status: 'live' })
              .eq('id', room.id)

            if (startErr) {
              log.push(`auto-start failed for room ${room.id}: ${startErr.message}`)
            } else {
              autoStarted++
              log.push(`Auto-started public room ${room.id} for game ${room.game_id}`)
              console.log(`poll-stats: Auto-started public room ${room.id} for game ${room.game_id}`)
            }
          }
        }
      }
    } catch (err) {
      log.push(`auto-start error: ${err.message}`)
      console.warn('poll-stats: auto-start error', err.message)
    }

    // ── Step 4: Find live games ──
    const { data: rooms, error: roomsError } = await supabase
      .from('rooms')
      .select('game_id, sport')
      .eq('status', 'live')

    if (roomsError) {
      console.error('poll-stats: rooms query failed', roomsError)
      Sentry.captureException(roomsError)
      return { statusCode: 500, body: JSON.stringify({ error: roomsError.message }) }
    }

    // Build a map of gameId → sport (last write wins, but each game_id should have one sport)
    const gameSportMap = new Map()
    for (const r of rooms ?? []) {
      gameSportMap.set(r.game_id, r.sport ?? 'nba')
    }
    const gameIds = [...new Set((rooms || []).map((r) => r.game_id))]
    log.push(`source=${statsSource} | Live games: ${gameIds.length} (${gameIds.join(', ') || 'none'})`)

    if (gameIds.length === 0) {
      console.log('poll-stats:', log.join(' | '))
      await releaseLock(supabase)
      return {
        statusCode: 200,
        body: JSON.stringify({ updated: 0, autoStarted, log }),
        headers: { 'Content-Type': 'application/json' },
      }
    }

    // ── Steps 5–7: Fetch, upsert, mark ──
    let inserted = 0
    let totalCardsMarked = 0

    for (const gameId of gameIds) {
      Sentry.setTag('game_id', gameId)
      const sport = gameSportMap.get(gameId) ?? 'nba'

      let result
      try {
        result = await getStatsForGame(gameId, statsSource, sport)
      } catch (fetchErr) {
        log.push(`game_id=${gameId} fetch failed: ${fetchErr.message}`)
        Sentry.captureException(fetchErr, { tags: { game_id: gameId } })
        continue
      }

      const events = result.events ?? []
      const gameStatus = result.gameStatus ?? null
      log.push(`game_id=${gameId} got ${events.length} events`)

      // Update room with live game status (period, clock, scores)
      if (gameStatus) {
        const { error: statusErr } = await supabase
          .from('rooms')
          .update({
            game_period: gameStatus.period,
            game_clock: gameStatus.clock,
            home_score: gameStatus.homeScore,
            away_score: gameStatus.awayScore,
            game_status_detail: gameStatus.statusDetail,
          })
          .eq('game_id', gameId)
          .eq('status', 'live')

        if (statusErr) console.warn(`poll-stats: status update failed for ${gameId}:`, statusErr.message)
      }

      for (const ev of events) {
        // Try to insert the stat event row
        const { error: insertError } = await supabase.from('stat_events').insert({
          game_id: ev.game_id ?? gameId,
          player_id: ev.player_id,
          stat_type: ev.stat_type,
          value: ev.value,
          period: ev.period,
        })

        const isNew = !insertError
        const isDuplicate = insertError?.code === '23505'

        if (insertError && !isDuplicate) {
          console.error('poll-stats: insert failed', insertError)
          Sentry.captureException(insertError, { tags: { game_id: gameId } })
          continue
        }

        if (isNew) inserted += 1

        // ALWAYS call mark_squares_for_event — even for duplicate inserts.
        // The RPC is idempotent: it only marks previously-unmarked squares
        // where event_value >= threshold. This ensures that if a player's
        // stat value increased since the last poll (e.g., points went from
        // 20 to 25), the new higher value triggers marking even though the
        // stat_event row may already exist.
        const { data: cardsUpdated, error: rpcError } = await supabase.rpc(
          'mark_squares_for_event',
          {
            p_game_id: gameId,
            p_stat_event: {
              player_id: ev.player_id,
              stat_type: ev.stat_type,
              value: ev.value,
            },
          }
        )

        if (rpcError) {
          console.error('poll-stats: mark_squares_for_event failed', rpcError)
          Sentry.captureException(rpcError, { tags: { game_id: gameId } })
        } else {
          totalCardsMarked += Number(cardsUpdated) || 0
        }
      }
    }

    log.push(`Inserted ${inserted} new events; cards updated: ${totalCardsMarked}`)

    // ── Step 8: Auto-finish rooms whose ESPN game is over ──
    let autoFinished = 0
    for (const gameId of gameIds) {
      if (espnStatusMap.get(gameId) !== 'STATUS_FINAL') continue

      const { data: finishedRooms, error: finishErr } = await supabase
        .from('rooms')
        .update({ status: 'finished' })
        .eq('game_id', gameId)
        .eq('status', 'live')
        .select('id')

      if (finishErr) {
        log.push(`auto-finish failed for game ${gameId}: ${finishErr.message}`)
        console.warn(`poll-stats: auto-finish failed for game ${gameId}`, finishErr.message)
      } else if (finishedRooms?.length) {
        autoFinished += finishedRooms.length
        log.push(`Auto-finished ${finishedRooms.length} room(s) for game ${gameId}`)
        console.log(`poll-stats: Auto-finished ${finishedRooms.length} room(s) for game ${gameId}`)

        // Award Dobs to all players in each finished room (idempotent RPC)
        for (const room of finishedRooms) {
          const { error: dobsErr } = await supabase.rpc('award_game_dabs', { p_room_id: room.id })
          if (dobsErr) {
            log.push(`award_game_dabs failed for room ${room.id}: ${dobsErr.message}`)
            console.warn(`poll-stats: award_game_dabs failed for room ${room.id}`, dobsErr.message)
          } else {
            log.push(`Dobs awarded for room ${room.id}`)
          }
        }
      }
    }

    console.log('poll-stats:', log.join(' | '))

    // ── Step 9: Release lock ──
    await releaseLock(supabase)

    return {
      statusCode: 200,
      body: JSON.stringify({
        source: statsSource,
        liveGames: gameIds.length,
        eventsInserted: inserted,
        cardsUpdated: totalCardsMarked,
        autoStarted,
        autoFinished,
        log,
      }),
      headers: { 'Content-Type': 'application/json' },
    }
  } catch (err) {
    console.error('poll-stats: error', err)
    Sentry.captureException(err)
    await releaseLock(supabase).catch(() => {})
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}

async function releaseLock(supabase) {
  try {
    await supabase.rpc('release_polling_lock', { p_key: LOCK_KEY })
  } catch (e) {
    console.warn('poll-stats: failed to release lock', e.message)
  }
}
