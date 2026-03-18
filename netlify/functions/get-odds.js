// Fetches NBA player prop odds from TheOddsAPI and returns a tiered prop pool.
// CRITICAL: API key must be set as ODDS_API_KEY environment variable — never hardcoded.

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'
const SPORT_KEY = 'basketball_nba'

// All player prop markets we want (including combos for PRA-style props)
const MARKETS = [
  'player_points',
  'player_rebounds',
  'player_assists',
  'player_threes',
  'player_steals',
  'player_blocks',
  'player_points_rebounds_assists',
  'player_points_rebounds',
  'player_points_assists',
  'player_rebounds_assists',
].join(',')

const VIG_FACTOR = 1.05

// 15-minute in-memory cache keyed by "away|home"
const cache = new Map()
const CACHE_TTL = 15 * 60 * 1000 // 15 min — critical for free tier (500 req/month)

// Stat type mapping from TheOddsAPI market → our stat_type
const MARKET_MAP = {
  player_points:                    { stat: 'points',      label: 'PTS' },
  player_rebounds:                  { stat: 'rebounds',    label: 'REB' },
  player_assists:                   { stat: 'assists',     label: 'AST' },
  player_threes:                    { stat: 'threes',      label: '3PM' },
  player_steals:                    { stat: 'steals',      label: 'STL' },
  player_blocks:                    { stat: 'blocks',      label: 'BLK' },
  player_points_rebounds_assists:   { stat: 'pts_reb_ast', label: 'PTS+REB+AST' },
  player_points_rebounds:           { stat: 'pts_reb',     label: 'PTS+REB' },
  player_points_assists:            { stat: 'pts_ast',     label: 'PTS+AST' },
  player_rebounds_assists:          { stat: 'reb_ast',     label: 'REB+AST' },
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function americanToImplied(odds) {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

function deVig(prob) {
  return Math.min(0.999, Math.max(0.001, prob / VIG_FACTOR))
}

function assignTier(deViggedProb) {
  if (deViggedProb >= 0.55) return 1   // easy: favorites, likely to hit
  if (deViggedProb >= 0.45) return 2   // medium: coin flip zone
  return 3                              // hard: underdogs, unlikely
}

function getLastName(fullName) {
  const parts = (fullName || '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''
}

function normalizeTeam(name) {
  return (name || '').toLowerCase().trim().replace(/^the\s+/, '')
}

function teamsMatch(a, b) {
  const na = normalizeTeam(a)
  const nb = normalizeTeam(b)
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true
  const la = na.split(' ').pop()
  const lb = nb.split(' ').pop()
  return la === lb && la.length > 3
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

exports.handler = async function(event) {
  const API_KEY = process.env.ODDS_API_KEY
  if (!API_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'ODDS_API_KEY not configured' }) }
  }

  const homeTeam = event.queryStringParameters?.home_team
  const awayTeam = event.queryStringParameters?.away_team

  if (!homeTeam || !awayTeam) {
    return { statusCode: 400, body: JSON.stringify({ error: 'home_team and away_team required' }) }
  }

  // Check cache
  const cacheKey = `${normalizeTeam(awayTeam)}|${normalizeTeam(homeTeam)}`
  const now = Date.now()
  const cached = cache.get(cacheKey)
  if (cached && now - cached.ts < CACHE_TTL) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify(cached.data),
    }
  }

  try {
    // Step 1: Find matching event
    const eventsUrl = `${ODDS_API_BASE}/sports/${SPORT_KEY}/events?apiKey=${API_KEY}`
    const eventsRes = await fetch(eventsUrl)
    if (!eventsRes.ok) throw new Error(`Events API: ${eventsRes.status}`)
    const events = await eventsRes.json()

    const matched = events.find(e =>
      (teamsMatch(e.home_team, homeTeam) && teamsMatch(e.away_team, awayTeam)) ||
      (teamsMatch(e.home_team, awayTeam) && teamsMatch(e.away_team, homeTeam))
    )

    if (!matched) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ props: [], meta: { source: 'none', reason: 'no_matching_event' } }),
      }
    }

    // Step 2: Fetch odds
    const oddsUrl = `${ODDS_API_BASE}/sports/${SPORT_KEY}/events/${matched.id}/odds?apiKey=${API_KEY}&regions=us&markets=${MARKETS}&oddsFormat=american`
    const oddsRes = await fetch(oddsUrl)
    if (!oddsRes.ok) throw new Error(`Odds API: ${oddsRes.status}`)
    const oddsData = await oddsRes.json()

    if (!oddsData.bookmakers?.length) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ props: [], meta: { source: 'none', reason: 'no_bookmakers' } }),
      }
    }

    // Use first bookmaker (typically DraftKings or FanDuel)
    const book = oddsData.bookmakers[0]
    const props = []
    const seen = new Set()

    for (const market of book.markets) {
      const mapping = MARKET_MAP[market.key]
      if (!mapping) continue

      for (const oc of market.outcomes) {
        if (oc.name?.toLowerCase() !== 'over') continue

        const playerName = oc.description
        const threshold = oc.point
        const americanOdds = oc.price

        if (!playerName || threshold == null || typeof americanOdds !== 'number') continue

        const implied = americanToImplied(americanOdds)
        const deVigged = deVig(implied)
        const tier = assignTier(deVigged)
        const lastName = getLastName(playerName)

        // Conflict key: same player + same stat = can't both be on one card
        const conflictKey = `${playerName}|${mapping.stat}`

        // Display text
        const label = `${lastName} ${threshold}+ ${mapping.label}`

        // Dedup by exact label
        if (seen.has(label)) continue
        seen.add(label)

        props.push({
          player_name: playerName,
          stat_type: mapping.stat,
          threshold,
          display_text: label,
          american_odds: americanOdds,
          implied_prob: Math.round(deVigged * 1000) / 1000,
          tier,
          conflict_key: conflictKey,
        })
      }
    }

    const result = {
      props,
      meta: {
        source: book.key,
        event_id: matched.id,
        home_team: matched.home_team,
        away_team: matched.away_team,
        generated_at: new Date().toISOString(),
        prop_count: props.length,
      },
    }

    // Cache
    cache.set(cacheKey, { data: result, ts: now })
    if (cache.size > 50) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts)[0]
      if (oldest) cache.delete(oldest[0])
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: JSON.stringify(result),
    }
  } catch (err) {
    console.error('get-odds error:', err)
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ props: [], meta: { source: 'error', reason: err.message } }),
    }
  }
}
