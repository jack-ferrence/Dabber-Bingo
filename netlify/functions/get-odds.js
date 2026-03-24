// Fetches NBA/NCAA player prop odds from TheOddsAPI and returns a tiered prop pool.
// CRITICAL: API key must be set as ODDS_API_KEY environment variable — never hardcoded.

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'

const SPORT_KEY_MAP = {
  nba:  'basketball_nba',
  ncaa: 'basketball_ncaab',
}

// All markets in one request — TheOddsAPI counts this as a single API call
const ALL_MARKETS = [
  // Featured (one line per player per stat)
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
  // Alternates (multiple real-odds thresholds per player per stat)
  'player_points_alternate',
  'player_rebounds_alternate',
  'player_assists_alternate',
  'player_threes_alternate',
  'player_steals_alternate',
  'player_blocks_alternate',
].join(',')

const VIG_FACTOR = 1.05

// 15-minute in-memory cache keyed by "away|home"
const cache = new Map()
const CACHE_TTL = 15 * 60 * 1000 // 15 min — critical for free tier (500 req/month)

// Stat type mapping from TheOddsAPI market → our stat_type
const MARKET_MAP = {
  // Standard
  player_points:                    { stat: 'points',      label: 'PTS' },
  player_rebounds:                  { stat: 'rebounds',    label: 'REB' },
  player_assists:                   { stat: 'assists',     label: 'AST' },
  player_threes:                    { stat: 'threes',      label: '3PM' },
  player_steals:                    { stat: 'steals',      label: 'STL' },
  player_blocks:                    { stat: 'blocks',      label: 'BLK' },
  player_points_rebounds_assists:   { stat: 'pts_reb_ast', label: 'PRA' },
  player_points_rebounds:           { stat: 'pts_reb',     label: 'PR' },
  player_points_assists:            { stat: 'pts_ast',     label: 'PA' },
  player_rebounds_assists:          { stat: 'reb_ast',     label: 'RA' },
  // Alternates (same stat mapping, multiple thresholds per player)
  player_points_alternate:          { stat: 'points',      label: 'PTS' },
  player_rebounds_alternate:        { stat: 'rebounds',    label: 'REB' },
  player_assists_alternate:         { stat: 'assists',     label: 'AST' },
  player_threes_alternate:          { stat: 'threes',      label: '3PM' },
  player_steals_alternate:          { stat: 'steals',      label: 'STL' },
  player_blocks_alternate:          { stat: 'blocks',      label: 'BLK' },
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

// ESPN abbreviation → lowercase keywords that appear in TheOddsAPI full team names.
// Covers all 30 NBA teams plus common NCAA tournament teams.
const ABBR_TO_KEYWORDS = {
  // NBA
  ATL:  ['hawks', 'atlanta'],
  BOS:  ['celtics', 'boston'],
  BKN:  ['nets', 'brooklyn'],
  CHA:  ['hornets', 'charlotte'],
  CHI:  ['bulls', 'chicago'],
  CLE:  ['cavaliers', 'cleveland'],
  DAL:  ['mavericks', 'dallas'],
  DEN:  ['nuggets', 'denver'],
  DET:  ['pistons', 'detroit'],
  GS:   ['warriors', 'golden state'],
  GSW:  ['warriors', 'golden state'],
  HOU:  ['rockets', 'houston'],
  IND:  ['pacers', 'indiana'],
  LAC:  ['clippers', 'la clippers', 'los angeles clippers'],
  LAL:  ['lakers', 'la lakers', 'los angeles lakers'],
  MEM:  ['grizzlies', 'memphis'],
  MIA:  ['heat', 'miami'],
  MIL:  ['bucks', 'milwaukee'],
  MIN:  ['timberwolves', 'minnesota'],
  NO:   ['pelicans', 'new orleans'],
  NOP:  ['pelicans', 'new orleans'],
  NY:   ['knicks', 'new york'],
  NYK:  ['knicks', 'new york'],
  OKC:  ['thunder', 'oklahoma city'],
  ORL:  ['magic', 'orlando'],
  PHI:  ['76ers', 'sixers', 'philadelphia'],
  PHX:  ['suns', 'phoenix'],
  POR:  ['trail blazers', 'blazers', 'portland'],
  SAC:  ['kings', 'sacramento'],
  SA:   ['spurs', 'san antonio'],
  SAS:  ['spurs', 'san antonio'],
  TOR:  ['raptors', 'toronto'],
  UTAH: ['jazz', 'utah'],
  UTA:  ['jazz', 'utah'],
  WAS:  ['wizards', 'washington'],
  WSH:  ['wizards', 'washington'],
  // NCAA — major tournament teams
  DUKE: ['duke', 'blue devils'],
  UNC:  ['north carolina', 'tar heels'],
  UK:   ['kentucky', 'wildcats'],
  KU:   ['kansas', 'jayhawks'],
  KAN:  ['kansas', 'jayhawks'],
  CONN: ['connecticut', 'uconn', 'huskies'],
  UCONN:['connecticut', 'uconn', 'huskies'],
  GONZ: ['gonzaga', 'bulldogs', 'zags'],
  AUB:  ['auburn', 'tigers'],
  TENN: ['tennessee', 'volunteers', 'vols'],
  PUR:  ['purdue', 'boilermakers'],
  HOUS: ['houston', 'cougars'],
  ALA:  ['alabama', 'crimson tide'],
  BAMA: ['alabama', 'crimson tide'],
  ISU:  ['iowa state', 'cyclones'],
  MSU:  ['michigan state', 'spartans'],
  MICH: ['michigan', 'wolverines'],
  OSU:  ['ohio state', 'buckeyes'],
  ILL:  ['illinois', 'illini'],
  ARIZ: ['arizona', 'wildcats'],
  ARK:  ['arkansas', 'razorbacks'],
  BAY:  ['baylor', 'bears'],
  MARQ: ['marquette', 'golden eagles'],
  TXAM: ['texas a&m', 'aggies'],
  TEX:  ['texas', 'longhorns'],
  WIS:  ['wisconsin', 'badgers'],
  ORE:  ['oregon', 'ducks'],
  UCLA: ['ucla', 'bruins'],
  USC:  ['usc', 'trojans'],
  FSU:  ['florida state', 'seminoles'],
  FLA:  ['florida', 'gators'],
  UF:   ['florida', 'gators'],
  LSU:  ['lsu', 'tigers'],
  VIL:  ['villanova', 'wildcats'],
  NOVA: ['villanova', 'wildcats'],
  IOWA: ['iowa', 'hawkeyes'],
  COLO: ['colorado', 'buffaloes'],
  MIZZ: ['missouri', 'tigers'],
  SYR:  ['syracuse', 'orange'],
  LOU:  ['louisville', 'cardinals'],
  WAKE: ['wake forest', 'demon deacons'],
  UVA:  ['virginia', 'cavaliers'],
  VT:   ['virginia tech', 'hokies'],
  PITT: ['pittsburgh', 'panthers'],
  ND:   ['notre dame', 'fighting irish'],
  CIN:  ['cincinnati', 'bearcats'],
  CINC: ['cincinnati', 'bearcats'],
  TXTECH: ['texas tech', 'red raiders'],
  TTU:  ['texas tech', 'red raiders'],
  SDSU: ['san diego state', 'aztecs'],
  FAU:  ['florida atlantic', 'owls'],
  UNM:  ['new mexico', 'lobos'],
  NMEX: ['new mexico', 'lobos'],
  MSST: ['mississippi state', 'bulldogs'],
  MISS: ['ole miss', 'mississippi', 'rebels'],
  STAN: ['stanford', 'cardinal'],
  WASH: ['washington', 'huskies'],
  WAZU: ['washington state', 'cougars'],
  OKLA: ['oklahoma', 'sooners'],
  OKST: ['oklahoma state', 'cowboys'],
  KSU:  ['kansas state', 'wildcats'],
  NEB:  ['nebraska', 'cornhuskers'],
  TCU:  ['tcu', 'horned frogs'],
  WVU:  ['west virginia', 'mountaineers'],
  SMU:  ['smu', 'mustangs'],
  NCST: ['nc state', 'wolfpack'],
  CLEM: ['clemson', 'tigers'],
  GT:   ['georgia tech', 'yellow jackets'],
  UGA:  ['georgia', 'bulldogs'],
  SC:   ['south carolina', 'gamecocks'],
  VCU:  ['vcu', 'rams'],
  DAY:  ['dayton', 'flyers'],
  XAV:  ['xavier', 'musketeers'],
}

function normalizeTeam(name) {
  return (name || '').toLowerCase().trim().replace(/^the\s+/, '')
}

/**
 * Check if ESPN abbreviation/name `a` matches TheOddsAPI full name `b` (or vice versa).
 * Uses abbreviation lookup first, then falls back to substring matching.
 */
function teamsMatch(a, b) {
  const na = normalizeTeam(a)
  const nb = normalizeTeam(b)

  if (na === nb) return true

  const aUpper = (a || '').trim().toUpperCase()
  const bUpper = (b || '').trim().toUpperCase()

  const aKeywords = ABBR_TO_KEYWORDS[aUpper]
  if (aKeywords) {
    for (const kw of aKeywords) {
      if (nb.includes(kw)) return true
    }
  }

  const bKeywords = ABBR_TO_KEYWORDS[bUpper]
  if (bKeywords) {
    for (const kw of bKeywords) {
      if (na.includes(kw)) return true
    }
  }

  // Substring fallback — require length > 3 to avoid false positives from short abbreviations
  if (na.length > 3 && nb.includes(na)) return true
  if (nb.length > 3 && na.includes(nb)) return true

  const la = na.split(' ').pop()
  const lb = nb.split(' ').pop()
  if (la === lb && la.length > 3) return true

  return false
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
  const sport = (event.queryStringParameters?.sport || 'nba').toLowerCase()
  const sportKey = SPORT_KEY_MAP[sport] ?? SPORT_KEY_MAP.nba

  if (!homeTeam || !awayTeam) {
    return { statusCode: 400, body: JSON.stringify({ error: 'home_team and away_team required' }) }
  }

  // Check cache (sport-aware key)
  const cacheKey = `${sport}|${normalizeTeam(awayTeam)}|${normalizeTeam(homeTeam)}`
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
    const eventsUrl = `${ODDS_API_BASE}/sports/${sportKey}/events?apiKey=${API_KEY}`
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
    const oddsUrl = `${ODDS_API_BASE}/sports/${sportKey}/events/${matched.id}/odds?apiKey=${API_KEY}&regions=us&markets=${ALL_MARKETS}&oddsFormat=american`
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
