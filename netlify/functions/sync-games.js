import { createClient } from '@supabase/supabase-js'

const ESPN_SCOREBOARD_NBA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
const ESPN_SCOREBOARD_NCAA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard?groups=100&limit=100'

/**
 * Netlify scheduled function (runs every 5 minutes via cron).
 *
 * For each NBA and NCAA tournament game that is scheduled or in-progress today/tomorrow:
 *   1. Check if a public room already exists for that game_id + sport
 *   2. If not, create one (status='lobby', room_type='public')
 *
 * For each ESPN game with STATUS_FINAL:
 *   3. Find any auto-created public rooms (created_by IS NULL) still in 'lobby' or 'live'
 *   4. Update those rooms to status='finished'
 *
 * Uses service role key to bypass RLS (system-created rows have created_by=NULL).
 *
 * Env vars:
 *   SUPABASE_URL              — Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (bypasses RLS)
 */
export async function handler() {
  const url = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  const missing = []
  if (!url) missing.push('SUPABASE_URL')
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY')
  if (missing.length > 0) {
    const msg = `sync-games: Missing env var(s): ${missing.join(', ')}`
    console.error(msg)
    return { statusCode: 500, body: JSON.stringify({ error: msg }) }
  }

  const supabase = createClient(url, serviceKey)
  const log = []

  // ── Step 1: Build today + tomorrow date strings ──
  const tomorrow = new Date()
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10).replace(/-/g, '')

  const nbaTodayUrl = ESPN_SCOREBOARD_NBA
  const nbaTomorrowUrl = `${ESPN_SCOREBOARD_NBA}?dates=${tomorrowStr}`
  // NCAA URL already has query params — append dates with &
  const ncaaTodayUrl = ESPN_SCOREBOARD_NCAA
  const ncaaTomorrowUrl = `${ESPN_SCOREBOARD_NCAA}&dates=${tomorrowStr}`

  // ── Step 2: Fetch all four URLs in parallel ──
  const [nbaTodayResult, nbaTomorrowResult, ncaaTodayResult, ncaaTomorrowResult] =
    await Promise.allSettled([
      fetchJson(nbaTodayUrl),
      fetchJson(nbaTomorrowUrl),
      fetchJson(ncaaTodayUrl),
      fetchJson(ncaaTomorrowUrl),
    ])

  // NBA today is fatal — we must have at least today's NBA data
  if (nbaTodayResult.status === 'rejected') {
    const err = nbaTodayResult.reason
    console.error('sync-games: ESPN NBA today fetch failed', err)
    return { statusCode: 502, body: JSON.stringify({ error: err.message }) }
  }

  // Parse NBA games (today required, tomorrow non-fatal)
  const nbaTodayGames = parseGames(nbaTodayResult.value.events ?? [], 'nba')
  let nbaTomorrowGames = []
  if (nbaTomorrowResult.status === 'fulfilled') {
    nbaTomorrowGames = parseGames(nbaTomorrowResult.value.events ?? [], 'nba')
  } else {
    console.warn('sync-games: ESPN NBA tomorrow fetch failed —', nbaTomorrowResult.reason?.message)
  }

  // Parse NCAA games (both days non-fatal)
  let ncaaTodayGames = []
  if (ncaaTodayResult.status === 'fulfilled') {
    ncaaTodayGames = parseGames(ncaaTodayResult.value.events ?? [], 'ncaa').filter(isTournamentGame)
  } else {
    console.warn('sync-games: ESPN NCAA today fetch failed —', ncaaTodayResult.reason?.message)
  }

  let ncaaTomorrowGames = []
  if (ncaaTomorrowResult.status === 'fulfilled') {
    ncaaTomorrowGames = parseGames(ncaaTomorrowResult.value.events ?? [], 'ncaa').filter(isTournamentGame)
  } else {
    console.warn('sync-games: ESPN NCAA tomorrow fetch failed —', ncaaTomorrowResult.reason?.message)
  }

  // ── Step 3: Combine and deduplicate per sport by id:sport ──
  // Today's entries take precedence over tomorrow's (live status is more current)
  const allRaw = [
    ...nbaTodayGames,
    ...nbaTomorrowGames,
    ...ncaaTodayGames,
    ...ncaaTomorrowGames,
  ]

  const seenKeys = new Set()
  const games = []
  for (const game of allRaw) {
    const key = `${game.id}:${game.sport}`
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      games.push(game)
    }
  }

  const nbaCount = games.filter((g) => g.sport === 'nba').length
  const ncaaCount = games.filter((g) => g.sport === 'ncaa').length
  log.push(`schedule: ${nbaCount} NBA + ${ncaaCount} NCAA tournament game(s) (today+tomorrow, deduped)`)

  // ── Step 4: Partition games by status ──
  const actionable = games.filter(
    (g) => g.status === 'STATUS_SCHEDULED' || g.status === 'STATUS_IN_PROGRESS'
  )
  const finished = games.filter((g) => g.status === 'STATUS_FINAL')

  log.push(`actionable: ${actionable.length} | finished: ${finished.length}`)

  // ── Step 5: Create rooms for scheduled/in-progress games ──
  let created = 0

  if (actionable.length > 0) {
    const actionableIds = actionable.map((g) => g.id)

    const { data: existingRooms, error: fetchErr } = await supabase
      .from('rooms')
      .select('game_id, sport')
      .eq('room_type', 'public')
      .in('game_id', actionableIds)

    if (fetchErr) {
      console.error('sync-games: existing rooms query failed', fetchErr)
      return { statusCode: 500, body: JSON.stringify({ error: fetchErr.message }) }
    }

    // Key by "gameId:sport" to handle same game_id across sports (shouldn't happen, but safe)
    const existingKeys = new Set((existingRooms ?? []).map((r) => `${r.game_id}:${r.sport}`))

    for (const game of actionable) {
      const key = `${game.id}:${game.sport}`
      if (existingKeys.has(key)) continue

      const { error: insertErr } = await supabase.from('rooms').insert({
        name: game.roomName,
        game_id: game.id,
        sport: game.sport,
        room_type: 'public',
        status: 'lobby',
        starts_at: game.startsAt,
        created_by: null,
      })

      if (insertErr) {
        // Unique constraint violation = another invocation beat us to it — not an error
        if (insertErr.code === '23505') {
          log.push(`${game.id} (${game.sport}): already created (race)`)
          continue
        }
        console.error(`sync-games: insert failed for game ${game.id}`, insertErr)
        log.push(`${game.id} (${game.sport}): INSERT FAILED — ${insertErr.message}`)
        continue
      }

      created++
      log.push(`created room for ${game.id} (${game.roomName}) [${game.sport}]`)
      console.log(`sync-games: created public room for game ${game.id} — ${game.roomName} [${game.sport}]`)
    }
  }

  log.push(`total created: ${created}`)

  // ── Step 6: Auto-finish rooms for ESPN games that are STATUS_FINAL ──
  let finishedCount = 0

  if (finished.length > 0) {
    const finishedIds = finished.map((g) => g.id)

    // Find auto-created public rooms for finished games that are still active
    const { data: staleRooms, error: staleErr } = await supabase
      .from('rooms')
      .select('id, game_id, sport')
      .eq('room_type', 'public')
      .is('created_by', null)
      .in('status', ['lobby', 'live'])
      .in('game_id', finishedIds)

    if (staleErr) {
      console.error('sync-games: stale rooms query failed', staleErr)
      log.push(`auto-finish: query failed — ${staleErr.message}`)
    } else if (staleRooms && staleRooms.length > 0) {
      const staleIds = staleRooms.map((r) => r.id)

      const { error: updateErr } = await supabase
        .from('rooms')
        .update({ status: 'finished' })
        .in('id', staleIds)

      if (updateErr) {
        console.error('sync-games: auto-finish update failed', updateErr)
        log.push(`auto-finish: UPDATE FAILED — ${updateErr.message}`)
      } else {
        finishedCount = staleRooms.length
        for (const room of staleRooms) {
          log.push(`finished room for game ${room.game_id} (${room.sport}) [id=${room.id}]`)
        }
        console.log(`sync-games: auto-finished ${finishedCount} room(s)`)
      }
    }
  }

  log.push(`total auto-finished: ${finishedCount}`)
  console.log('sync-games:', log.join(' | '))

  return {
    statusCode: 200,
    body: JSON.stringify({ created, finished: finishedCount, log }),
    headers: { 'Content-Type': 'application/json' },
  }
}

// ---------------------------------------------------------------------------
// Fetch helper
// ---------------------------------------------------------------------------

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN returned ${res.status} for ${url}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// ESPN parsing helpers
// ---------------------------------------------------------------------------

function parseGames(events, sport) {
  return events.map((event) => {
    const competition = event.competitions?.[0]
    const competitors = competition?.competitors ?? []

    const home = competitors.find((c) => c.homeAway === 'home') ?? competitors[1]
    const away = competitors.find((c) => c.homeAway === 'away') ?? competitors[0]

    const homeAbbr = home?.team?.abbreviation ?? 'HOM'
    const awayAbbr = away?.team?.abbreviation ?? 'AWY'

    return {
      id: String(event.id),
      sport,
      status: event.status?.type?.name ?? '',
      roomName: `${awayAbbr} vs ${homeAbbr}`,
      startsAt: event.date ?? null,
      _event: event,
    }
  })
}

/**
 * NCAA tournament filter.
 * season.type === 3 is ESPN's postseason indicator — the most reliable signal.
 * Falls back to checking competition notes for tournament keywords.
 * If neither is available, accept the game (groups=100 already scopes to tournament).
 */
function isTournamentGame(game) {
  const event = game._event

  // Primary: ESPN season type 3 = postseason (NCAA Tournament)
  if (event.season?.type === 3) return true

  const competition = event.competitions?.[0]

  // Secondary: competition notes containing tournament keywords
  const notes = competition?.notes ?? []
  const hasChampNote = notes.some((n) =>
    /ncaa|championship|tournament/i.test(n.headline ?? n.text ?? '')
  )
  if (hasChampNote) return true

  // Tertiary: explicit tournamentId field
  if (competition?.tournamentId) return true

  // groups=100 scopes to tournament bracket — accept remaining
  return true
}
