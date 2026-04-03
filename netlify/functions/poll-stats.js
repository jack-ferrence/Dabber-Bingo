import * as Sentry from '@sentry/node'
import { createClient } from '@supabase/supabase-js'
import { getStatsForGame, fetchLiveEspnGames } from '../../src/lib/statsProvider.js'
import { fetchRoster } from './lib/odds-utils.js'

const LOCK_KEY = 'poll-stats'
const LOCK_TTL_SECONDS = 50

/**
 * Backfill jersey numbers into odds_pool and existing cards.
 * Called once when an MLB game transitions lobby→live (boxscore now has jersey data).
 */
async function backfillJerseyNumbers(supabase, room, roster) {
  if (!roster?.length || !room?.odds_pool?.length) return 0

  const jerseyMap = new Map()
  for (const p of roster) {
    if (p.id && p.jersey) jerseyMap.set(String(p.id), String(p.jersey))
  }
  if (jerseyMap.size === 0) return 0

  // Update odds_pool in the room
  let poolChanged = false
  const updatedPool = room.odds_pool.map(prop => {
    if (prop.player_id && !prop.jersey_number && jerseyMap.has(String(prop.player_id))) {
      poolChanged = true
      return { ...prop, jersey_number: jerseyMap.get(String(prop.player_id)) }
    }
    return prop
  })
  if (poolChanged) {
    await supabase.from('rooms').update({ odds_pool: updatedPool }).eq('id', room.id)
  }

  // Update existing cards
  const { data: cards } = await supabase
    .from('cards')
    .select('id, squares')
    .eq('room_id', room.id)

  let cardSquaresUpdated = 0
  for (const card of (cards ?? [])) {
    if (!card.squares?.length) continue
    let cardChanged = false
    const updatedSquares = card.squares.map(sq => {
      if (sq?.player_id && !sq.jersey_number && jerseyMap.has(String(sq.player_id))) {
        cardChanged = true
        return { ...sq, jersey_number: jerseyMap.get(String(sq.player_id)) }
      }
      return sq
    })
    if (cardChanged) {
      await supabase.from('cards').update({ squares: updatedSquares }).eq('id', card.id)
      cardSquaresUpdated++
    }
  }

  return jerseyMap.size
}

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
      const [nbaGames, ncaaGames, mlbGames] = await Promise.allSettled([
        fetchLiveEspnGames('nba'),
        fetchLiveEspnGames('ncaa'),
        fetchLiveEspnGames('mlb'),
      ])
      let total = 0
      for (const result of [nbaGames, ncaaGames, mlbGames]) {
        if (result.status === 'fulfilled') {
          for (const g of result.value) {
            espnStatusMap.set(g.id, g.status)
          }
          total += result.value.length
        }
      }
      log.push(`ESPN scoreboard: ${total} game(s) (NBA + NCAA + MLB)`)
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
        .select('id, game_id, sport, odds_pool')
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

              // MLB: backfill jersey numbers now that boxscore is available
              if (room.sport === 'mlb') {
                try {
                  const freshRoster = await fetchRoster(room.game_id, 'mlb')
                  const filled = await backfillJerseyNumbers(supabase, room, freshRoster)
                  if (filled > 0) log.push(`jersey backfill: ${filled} players for game ${room.game_id}`)
                } catch (e) {
                  console.warn(`poll-stats: jersey backfill failed for ${room.game_id}:`, e.message)
                }
              }
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
    // Save full results for Step 7.5 (injury detection) — avoids a second ESPN fetch
    const gameResults = new Map()

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

      gameResults.set(gameId, result)
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

    // ── Step 7.5: Handle confirmed mid-game injuries ──────────────────────────
    // Only acts on players ESPN has definitively removed from the game.
    // Two confirmation paths:
    //   PATH 1 — ESPN sets didNotPlay=true on a player who previously had stats
    //   PATH 2 — Player disappears from boxscore entirely for 3+ consecutive cycles
    // We never guess; ambiguous cases (bench, 0 stats, 1-2 missing cycles) are left alone.
    let injuryReplacements = 0

    for (const gameId of gameIds) {
      const result = gameResults.get(gameId)
      if (!result) continue

      const ruledOutPlayers   = result.ruledOutPlayers   ?? []
      const boxscorePlayerIds = result.boxscorePlayerIds ?? new Set()

      const { data: liveRooms } = await supabase
        .from('rooms')
        .select('id, game_id, odds_pool, player_count_at_lock, injury_replaced_player_ids, missing_player_counts')
        .eq('game_id', gameId)
        .eq('status', 'live')

      if (!liveRooms?.length) continue

      // Players who have ever produced a stat event in this game are "known active"
      const { data: knownPlayerEvents } = await supabase
        .from('stat_events')
        .select('player_id')
        .eq('game_id', gameId)
      const knownPlayerIds = new Set((knownPlayerEvents ?? []).map(e => e.player_id))

      for (const room of liveRooms) {
        const alreadyReplaced = new Set(room.injury_replaced_player_ids ?? [])
        const missingCounts   = { ...(room.missing_player_counts ?? {}) }

        // PATH 1: ESPN explicitly flagged didNotPlay=true — immediate, no delay needed
        const espnConfirmed = ruledOutPlayers
          .map(p => p.id)
          // Only treat as mid-game injury if we've seen stats from them before
          .filter(id => knownPlayerIds.has(id) && !alreadyReplaced.has(id))

        // PATH 2: Player with prior stats has vanished from boxscore entirely
        const disappeared = [...knownPlayerIds].filter(id =>
          !boxscorePlayerIds.has(id) && !alreadyReplaced.has(id)
        )
        for (const id of disappeared) {
          missingCounts[id] = (missingCounts[id] ?? 0) + 1
        }
        // Reset counter for any players who reappeared
        for (const id of Object.keys(missingCounts)) {
          if (boxscorePlayerIds.has(id)) delete missingCounts[id]
        }
        const disappearConfirmed = Object.entries(missingCounts)
          .filter(([, count]) => count >= 3)
          .map(([id]) => id)

        // Persist updated missing counts (even if no replacements this cycle)
        await supabase.from('rooms').update({ missing_player_counts: missingCounts }).eq('id', room.id)

        const confirmedOut = [...new Set([...espnConfirmed, ...disappearConfirmed])]
        if (confirmedOut.length === 0) continue

        log.push(`game ${gameId}: ${confirmedOut.length} player(s) confirmed out — [${confirmedOut.join(', ')}]`)

        // Build current stat totals per player (for progress-matching)
        const { data: allStatEvents } = await supabase
          .from('stat_events')
          .select('player_id, stat_type, value')
          .eq('game_id', gameId)

        const currentStats = new Map()
        for (const ev of (allStatEvents ?? [])) {
          if (!currentStats.has(ev.player_id)) currentStats.set(ev.player_id, {})
          const ps  = currentStats.get(ev.player_id)
          const val = Number(ev.value) || 0
          if (!ps[ev.stat_type] || val > ps[ev.stat_type]) ps[ev.stat_type] = val
        }

        // Active = present in boxscore, not confirmed out, not previously replaced
        const activePlayerIds = new Set(
          [...boxscorePlayerIds].filter(id => !confirmedOut.includes(id) && !alreadyReplaced.has(id))
        )

        const { data: cards } = await supabase
          .from('cards')
          .select('id, squares')
          .eq('room_id', room.id)

        const oddsPool = room.odds_pool ?? []

        for (const card of (cards ?? [])) {
          const squares = card.squares ?? []
          let changed = false
          const newSquares = [...squares]
          const usedKeys = new Set(
            squares
              .filter(s => s?.stat_type !== 'free' && s?.conflict_key)
              .map(s => s.conflict_key)
          )

          for (let i = 0; i < 25; i++) {
            const sq = squares[i]
            if (!sq || i === 12 || sq.stat_type === 'free') continue
            if (sq.marked === true) continue
            if (!confirmedOut.includes(sq.player_id)) continue

            const injuredStats  = currentStats.get(sq.player_id) ?? {}
            const currentValue  = injuredStats[sq.stat_type] ?? 0
            const threshold     = sq.threshold ?? 1
            const progress      = threshold > 0 ? currentValue / threshold : 0

            const replacement = findProgressMatchedReplacement(
              oddsPool, usedKeys, activePlayerIds, confirmedOut, currentStats, progress
            )

            if (replacement) {
              newSquares[i] = {
                id:            sq.id,
                player_id:     replacement.player_id,
                player_name:   replacement.player_name,
                team_abbr:     replacement.team_abbr ?? '',
                stat_type:     replacement.stat_type,
                threshold:     replacement.threshold,
                display_text:  replacement.display_text,
                american_odds: replacement.american_odds,
                implied_prob:  replacement.implied_prob,
                tier:          replacement.tier,
                conflict_key:  replacement.conflict_key,
                marked:        false,
                replaced_injury: true,
              }
              usedKeys.add(replacement.conflict_key)
              changed = true
              injuryReplacements++
            }
          }

          if (changed) {
            await supabase.from('cards').update({ squares: newSquares }).eq('id', card.id)
          }
        }

        // Mark these players as processed so we don't re-replace next cycle
        const newReplacedIds = [...new Set([...alreadyReplaced, ...confirmedOut])]
        for (const id of confirmedOut) delete missingCounts[id]

        await supabase.from('rooms').update({
          injury_replaced_player_ids: newReplacedIds,
          missing_player_counts:      missingCounts,
        }).eq('id', room.id)
      }
    }

    if (injuryReplacements > 0) {
      log.push(`injury replacements: ${injuryReplacements} square(s) replaced`)
    }

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

          // Auto-award featured game winner if this room is linked to one
          const { data: linkedFg } = await supabase
            .from('featured_games')
            .select('id, winner_user_id')
            .eq('room_id', room.id)
            .is('winner_user_id', null)
            .maybeSingle()

          if (linkedFg) {
            const { data: awardResult } = await supabase.rpc('award_featured_winner', {
              p_featured_game_id: linkedFg.id,
            })
            if (awardResult?.success) {
              log.push(`Featured game ${linkedFg.id} winner: ${awardResult.winner_username}`)
              console.log(`poll-stats: Featured game ${linkedFg.id} winner: ${awardResult.winner_username}`)
            } else if (awardResult?.reason) {
              log.push(`Featured game ${linkedFg.id} award skipped: ${awardResult.reason}`)
            }
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

/**
 * Find the best replacement prop for an injured player's square.
 *
 * Prefers active props whose current completion progress (currentValue/threshold)
 * is closest to the injured player's progress, so the replacement is fair:
 * - Neither an almost-completed freebie nor an impossible longshot
 *
 * Tiers: ±15% diff first, then ±30%, then closest regardless.
 *
 * @param {Array}  pool           - room's odds_pool (matched props)
 * @param {Set}    usedKeys       - conflict keys already on this card
 * @param {Set}    activePlayerIds - ESPN player IDs currently in the game
 * @param {Array}  confirmedOutIds - player IDs confirmed ruled out this cycle
 * @param {Map}    currentStats   - player_id → { stat_type: currentValue }
 * @param {number} targetProgress - 0-1 ratio (injured player's current/threshold)
 * @returns {Object|null} best candidate prop, or null if none available
 */
function findProgressMatchedReplacement(pool, usedKeys, activePlayerIds, confirmedOutIds, currentStats, targetProgress) {
  const candidates = pool.filter(p =>
    activePlayerIds.has(p.player_id) &&
    !confirmedOutIds.includes(p.player_id) &&
    !usedKeys.has(p.conflict_key)
  )
  if (candidates.length === 0) return null

  const withProgress = candidates.map(p => {
    const ps           = currentStats.get(p.player_id) ?? {}
    const currentValue = ps[p.stat_type] ?? 0
    const threshold    = p.threshold ?? 1
    const progress     = threshold > 0 ? currentValue / threshold : 0
    return { ...p, progress, progressDiff: Math.abs(progress - targetProgress) }
  })
  withProgress.sort((a, b) => a.progressDiff - b.progressDiff)

  const tight  = withProgress.filter(p => p.progressDiff <= 0.15)
  if (tight.length  > 0) return tight[0]
  const medium = withProgress.filter(p => p.progressDiff <= 0.30)
  if (medium.length > 0) return medium[0]
  return withProgress[0] ?? null
}

async function releaseLock(supabase) {
  try {
    await supabase.rpc('release_polling_lock', { p_key: LOCK_KEY })
  } catch (e) {
    console.warn('poll-stats: failed to release lock', e.message)
  }
}
