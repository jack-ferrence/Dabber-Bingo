// Set DEBUG_ROSTER=true in Netlify env to enable verbose logging
const DEBUG = !!process.env.DEBUG_ROSTER
function dbg(...args) { if (DEBUG) console.log('[get-roster]', ...args) }

const ESPN_SUMMARY_NBA  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'
const ESPN_SUMMARY_NCAA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary'
const ESPN_TEAMS_NBA    = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
const ESPN_TEAMS_NCAA   = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'

const rosterCache = new Map()
const CACHE_TTL = 300_000

function getSummaryBase(sport) {
  return sport === 'ncaa' ? ESPN_SUMMARY_NCAA : ESPN_SUMMARY_NBA
}

function getTeamsBase(sport) {
  return sport === 'ncaa' ? ESPN_TEAMS_NCAA : ESPN_TEAMS_NBA
}

function lastName(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''
}

/**
 * Parse players from the in-progress boxscore (summaryData.boxscore.players).
 * Each entry under statistics[0].athletes has { athlete: { id, displayName, ... }, stats: [] }.
 */
function parseBoxscorePlayers(summaryData) {
  const teams = summaryData.boxscore?.players ?? []
  const players = []

  for (const team of teams) {
    const teamName = team.team?.displayName ?? ''
    const teamAbbr = team.team?.abbreviation ?? ''
    const athletes = team.statistics?.[0]?.athletes ?? []

    for (const entry of athletes) {
      const athlete = entry.athlete
      if (!athlete?.id) continue
      players.push({
        id: String(athlete.id),
        name: athlete.displayName ?? athlete.fullName ?? '',
        lastName: lastName(athlete.displayName ?? athlete.fullName ?? ''),
        team: teamName,
        teamAbbr,
        position: athlete.position?.abbreviation ?? '',
      })
    }
  }

  return players
}

/**
 * Parse players from the team roster endpoint (GET /teams/{id}/roster).
 * Response shape: { team: {...}, athletes: [{ id, displayName, position, ... }] }
 * Athletes are flat — NOT wrapped in { athlete: {...} }.
 */
function parseTeamRoster(rosterData) {
  const teamName = rosterData.team?.displayName ?? ''
  const teamAbbr = rosterData.team?.abbreviation ?? ''
  const players = []

  for (const athlete of rosterData.athletes ?? []) {
    if (!athlete?.id) continue
    players.push({
      id: String(athlete.id),
      name: athlete.displayName ?? athlete.fullName ?? '',
      lastName: lastName(athlete.displayName ?? athlete.fullName ?? ''),
      team: teamName,
      teamAbbr,
      position: athlete.position?.abbreviation ?? '',
    })
  }

  return players
}

/**
 * Extract team IDs + abbreviations from the summary header.
 * Used to fall back to the team roster endpoint when boxscore is empty (pre-game).
 */
function getCompetitorTeams(summaryData) {
  const competitors = summaryData.header?.competitions?.[0]?.competitors ?? []
  return competitors
    .map((c) => ({ id: c.team?.id, abbr: c.team?.abbreviation ?? '' }))
    .filter((t) => t.id)
}

/**
 * Fetch both team rosters in parallel and combine into one player list.
 */
async function fetchTeamRosters(teams, sport) {
  const teamsBase = getTeamsBase(sport)
  const results = await Promise.allSettled(
    teams.map((t) => fetch(`${teamsBase}/${t.id}/roster`).then((r) => r.json()))
  )
  const players = []
  for (const result of results) {
    if (result.status === 'fulfilled') {
      players.push(...parseTeamRoster(result.value))
    }
  }
  return players
}

exports.handler = async function (event) {
  const gameId = event.queryStringParameters?.game_id
  const sport  = event.queryStringParameters?.sport ?? 'nba'

  dbg('request', { gameId, sport })

  if (!gameId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'game_id query parameter is required' }),
    }
  }

  const cacheKey = `${sport}:${gameId}`
  const now = Date.now()
  const cached = rosterCache.get(cacheKey)
  if (cached && now - cached.ts < CACHE_TTL) {
    dbg('cache hit', cacheKey)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify(cached.data),
    }
  }

  const summaryUrl = `${getSummaryBase(sport)}?event=${gameId}`
  dbg('fetching summary', summaryUrl)

  try {
    const res = await fetch(summaryUrl)
    if (!res.ok) throw new Error(`ESPN summary returned ${res.status}`)

    const raw = await res.json()
    dbg('summary top-level keys', Object.keys(raw))

    // ── Path 1: in-progress boxscore ──────────────────────────────────────────
    let players = parseBoxscorePlayers(raw)
    dbg('boxscore players found', players.length, players.slice(0, 3).map((p) => p.name))

    // ── Path 2: pre-game fallback — fetch team rosters directly ───────────────
    if (players.length === 0) {
      dbg('boxscore empty — trying team roster fallback')
      const teams = getCompetitorTeams(raw)
      dbg('competitor teams from header', teams)

      if (teams.length > 0) {
        players = await fetchTeamRosters(teams, sport)
        dbg('team roster players found', players.length, players.slice(0, 3).map((p) => p.name))
      }
    }

    if (players.length === 0) {
      dbg('no players found via any path')
      return {
        statusCode: 404,
        body: JSON.stringify({ error: 'No roster data found for this game', game_id: gameId }),
      }
    }

    const result = { game_id: gameId, players }
    rosterCache.set(cacheKey, { data: result, ts: now })

    if (rosterCache.size > 100) {
      const oldest = [...rosterCache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
      if (oldest) rosterCache.delete(oldest[0])
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify(result),
    }
  } catch (err) {
    console.error('get-roster: ESPN fetch failed', err)
    return {
      statusCode: 502,
      body: JSON.stringify({ error: 'Failed to fetch roster from ESPN', detail: err.message }),
    }
  }
}
