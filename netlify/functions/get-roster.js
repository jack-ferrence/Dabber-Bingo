const ESPN_SUMMARY_NBA  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'
const ESPN_SUMMARY_NCAA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary'

const rosterCache = new Map()
const CACHE_TTL = 300_000

function lastName(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''
}

function parseRoster(summaryData) {
  const rosters = summaryData.rosters ?? summaryData.boxscore?.players ?? []
  const players = []

  for (const team of rosters) {
    const teamName = team.team?.displayName ?? team.team?.shortDisplayName ?? ''
    const teamAbbr = team.team?.abbreviation ?? ''

    const athletes =
      team.roster ?? team.statistics?.[0]?.athletes ?? []

    for (const entry of athletes) {
      const athlete = entry.athlete ?? entry
      if (!athlete?.id) continue

      players.push({
        id: String(athlete.id),
        name: athlete.displayName ?? athlete.fullName ?? '',
        lastName: lastName(athlete.displayName ?? athlete.fullName ?? ''),
        team: teamName,
        teamAbbr,
        position: athlete.position?.abbreviation ?? entry.position ?? '',
      })
    }
  }

  return players
}

exports.handler = async function (event) {
  const gameId = event.queryStringParameters?.game_id
  const sport = event.queryStringParameters?.sport ?? 'nba'

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
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify(cached.data),
    }
  }

  const summaryBase = sport === 'ncaa' ? ESPN_SUMMARY_NCAA : ESPN_SUMMARY_NBA

  try {
    const res = await fetch(`${summaryBase}?event=${gameId}`)
    if (!res.ok) throw new Error(`ESPN returned ${res.status}`)

    const raw = await res.json()
    const players = parseRoster(raw)

    if (players.length === 0) {
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
