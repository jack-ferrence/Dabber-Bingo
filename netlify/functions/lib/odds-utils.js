/**
 * Shared odds utilities for sync-games and refresh-odds.
 *
 * Extracted so both functions can fetch odds, match rosters, and
 * reconcile cards without duplicating code.
 */

import { generateOddsBasedCard, getBand } from '../../../src/game/oddsCardGenerator.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'
export const SPORT_KEY_MAP = { nba: 'basketball_nba', ncaa: 'basketball_ncaab' }
export const VIG_FACTOR = 1.05
export const MIN_UNIQUE_CONFLICT_KEYS = 16

// All markets in one string — TheOddsAPI counts a single /events/{id}/odds call
// regardless of how many markets are requested, so combining saves API budget.
export const ALL_MARKETS = [
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

const ESPN_SUMMARY_NBA  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'
const ESPN_SUMMARY_NCAA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary'
const ESPN_TEAMS_NBA    = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
const ESPN_TEAMS_NCAA   = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'

export const MARKET_MAP = {
  // Standard
  player_points:                  { stat: 'points',      label: 'PTS' },
  player_rebounds:                { stat: 'rebounds',    label: 'REB' },
  player_assists:                 { stat: 'assists',     label: 'AST' },
  player_threes:                  { stat: 'threes',      label: '3PM' },
  player_steals:                  { stat: 'steals',      label: 'STL' },
  player_blocks:                  { stat: 'blocks',      label: 'BLK' },
  player_points_rebounds_assists: { stat: 'pts_reb_ast', label: 'PRA' },
  player_points_rebounds:         { stat: 'pts_reb',     label: 'PR' },
  player_points_assists:          { stat: 'pts_ast',     label: 'PA' },
  player_rebounds_assists:        { stat: 'reb_ast',     label: 'RA' },
  // Alternates (same stat types, multiple thresholds per player)
  player_points_alternate:        { stat: 'points',      label: 'PTS' },
  player_rebounds_alternate:      { stat: 'rebounds',    label: 'REB' },
  player_assists_alternate:       { stat: 'assists',     label: 'AST' },
  player_threes_alternate:        { stat: 'threes',      label: '3PM' },
  player_steals_alternate:        { stat: 'steals',      label: 'STL' },
  player_blocks_alternate:        { stat: 'blocks',      label: 'BLK' },
}

// ESPN abbreviation → lowercase keywords that appear in TheOddsAPI full team names.
export const ABBR_TO_KEYWORDS = {
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

// ---------------------------------------------------------------------------
// Internal utilities
// ---------------------------------------------------------------------------

function americanToImplied(odds) {
  if (odds > 0) return 100 / (odds + 100)
  return Math.abs(odds) / (Math.abs(odds) + 100)
}

function deVig(prob) {
  return Math.min(0.999, Math.max(0.001, prob / VIG_FACTOR))
}

function assignTier(p) {
  return p >= 0.55 ? 1 : p >= 0.45 ? 2 : 3
}

function getLastName(name) {
  const parts = (name || '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''
}

function normalizeTeam(name) {
  return (name || '').toLowerCase().trim().replace(/^the\s+/, '')
}

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z]/g, '')
}

// ---------------------------------------------------------------------------
// Team matching
// ---------------------------------------------------------------------------

function teamsMatch(a, b) {
  const na = normalizeTeam(a)
  const nb = normalizeTeam(b)
  if (na === nb) return true

  const aUpper = (a || '').trim().toUpperCase()
  const bUpper = (b || '').trim().toUpperCase()

  const aKeywords = ABBR_TO_KEYWORDS[aUpper]
  if (aKeywords) {
    for (const kw of aKeywords) { if (nb.includes(kw)) return true }
  }

  const bKeywords = ABBR_TO_KEYWORDS[bUpper]
  if (bKeywords) {
    for (const kw of bKeywords) { if (na.includes(kw)) return true }
  }

  if (na.length > 3 && nb.includes(na)) return true
  if (nb.length > 3 && na.includes(nb)) return true

  const la = na.split(' ').pop()
  const lb = nb.split(' ').pop()
  if (la === lb && la.length > 3) return true

  return false
}

// ---------------------------------------------------------------------------
// Fetch helpers
// ---------------------------------------------------------------------------

export async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// ESPN roster fetch
// ---------------------------------------------------------------------------

export async function fetchRoster(gameId, sport) {
  const summaryUrl = sport === 'ncaa' ? ESPN_SUMMARY_NCAA : ESPN_SUMMARY_NBA
  const teamsUrl   = sport === 'ncaa' ? ESPN_TEAMS_NCAA   : ESPN_TEAMS_NBA

  const data = await fetchJson(`${summaryUrl}?event=${gameId}`)
  const players = []

  // Primary: boxscore (game in progress or recently completed)
  for (const team of (data.boxscore?.players ?? [])) {
    const teamName = team.team?.displayName ?? ''
    for (const entry of (team.statistics?.[0]?.athletes ?? [])) {
      const a = entry.athlete
      if (!a?.id) continue
      players.push({ id: String(a.id), name: a.displayName ?? '', lastName: getLastName(a.displayName ?? ''), team: teamName })
    }
  }

  // Fallback: pre-game — pull from team roster endpoint
  if (players.length === 0) {
    const competitors = data.header?.competitions?.[0]?.competitors ?? []
    for (const comp of competitors) {
      const teamId = comp.id ?? comp.team?.id
      const teamName = comp.team?.displayName ?? ''
      if (!teamId) continue
      try {
        const rosterData = await fetchJson(`${teamsUrl}/${teamId}/roster`)
        for (const a of (rosterData.athletes ?? [])) {
          if (!a?.id) continue
          players.push({ id: String(a.id), name: a.displayName ?? '', lastName: getLastName(a.displayName ?? ''), team: teamName })
        }
      } catch (e) {
        console.warn(`odds-utils: roster fetch failed for team ${teamId}:`, e.message)
      }
    }
  }

  return players
}

// ---------------------------------------------------------------------------
// Event list with Supabase + invocation caching
// ---------------------------------------------------------------------------

export async function getEventList(sport, apiKey, ctx, supabase) {
  // Check invocation cache first (fastest)
  if (ctx.eventListCache.has(sport)) return ctx.eventListCache.get(sport)

  // Check Supabase cache (valid for 6 hours — saves API calls across invocations)
  if (supabase) {
    const cacheKey = `events_${sport}`
    const { data: cached } = await supabase
      .from('odds_cache')
      .select('data, fetched_at')
      .eq('key', cacheKey)
      .maybeSingle()

    if (cached) {
      const ageMs = Date.now() - new Date(cached.fetched_at).getTime()
      if (ageMs < 6 * 60 * 60 * 1000) {
        ctx.eventListCache.set(sport, cached.data)
        return cached.data
      }
    }
  }

  // Fetch fresh from TheOddsAPI
  const sportKey = SPORT_KEY_MAP[sport] ?? SPORT_KEY_MAP.nba
  ctx.apiCallsMade++
  console.log(`odds-utils: API call #${ctx.apiCallsMade} — event list for ${sport}`)
  const events = await fetchJson(`${ODDS_API_BASE}/sports/${sportKey}/events?apiKey=${apiKey}`)

  ctx.eventListCache.set(sport, events)

  if (supabase) {
    try {
      await supabase.from('odds_cache').upsert({
        key: `events_${sport}`,
        data: events,
        fetched_at: new Date().toISOString(),
      })
    } catch { /* non-fatal — in-memory cache already populated */ }
  }

  return events
}

// ---------------------------------------------------------------------------
// TheOddsAPI odds fetch for a single room
// ---------------------------------------------------------------------------

export async function fetchOddsForRoom(room, apiKey, ctx, supabase) {
  const sport    = room.sport || 'nba'
  const sportKey = SPORT_KEY_MAP[sport] ?? SPORT_KEY_MAP.nba

  let eventId = room.oddsapi_event_id

  if (!eventId) {
    const nameParts = (room.name || '').split(' vs ')
    if (nameParts.length < 2) return { props: [], reason: 'bad_room_name' }

    const events = await getEventList(sport, apiKey, ctx, supabase)
    const matched = events.find(e =>
      (teamsMatch(e.home_team, nameParts[1]) && teamsMatch(e.away_team, nameParts[0])) ||
      (teamsMatch(e.home_team, nameParts[0]) && teamsMatch(e.away_team, nameParts[1]))
    )
    if (!matched) return { props: [], reason: 'no_matching_event' }
    eventId = matched.id
  }

  ctx.apiCallsMade++
  console.log(`odds-utils: API call #${ctx.apiCallsMade} — odds for event ${eventId}`)
  const oddsData = await fetchJson(
    `${ODDS_API_BASE}/sports/${sportKey}/events/${eventId}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=${ALL_MARKETS}&oddsFormat=american`
  )

  const book = oddsData.bookmakers?.[0]
  if (!book) return { props: [], reason: 'no_bookmakers', eventId }

  const props = []
  const seen  = new Set()

  for (const market of (book.markets ?? [])) {
    const mapping = MARKET_MAP[market.key]
    if (!mapping) continue
    for (const oc of (market.outcomes ?? [])) {
      if (oc.name?.toLowerCase() !== 'over') continue
      const { description: playerName, point: threshold, price: americanOdds } = oc
      if (!playerName || threshold == null || typeof americanOdds !== 'number') continue

      const deVigged    = deVig(americanToImplied(americanOdds))
      const conflictKey = `${playerName}|${mapping.stat}`
      const label       = `${getLastName(playerName)} ${threshold}+ ${mapping.label}`
      if (seen.has(label)) continue
      seen.add(label)

      props.push({
        player_name:   playerName,
        stat_type:     mapping.stat,
        threshold,
        display_text:  label,
        american_odds: americanOdds,
        implied_prob:  Math.round(deVigged * 1000) / 1000,
        tier:          assignTier(deVigged),
        conflict_key:  conflictKey,
      })
    }
  }

  return { props, source: book.key, eventId }
}

// ---------------------------------------------------------------------------
// Roster matching
// ---------------------------------------------------------------------------

export function matchOddsToRoster(oddsProps, rosterPlayers) {
  if (!rosterPlayers?.length) return []
  const byFull = new Map()
  const byLast = new Map()
  for (const p of rosterPlayers) {
    byFull.set(normalizeName(p.name), p)
    const l = normalizeName(p.lastName || getLastName(p.name))
    if (l && !byLast.has(l)) byLast.set(l, p)
  }
  const matched = []
  for (const prop of oddsProps) {
    const fn = normalizeName(prop.player_name)
    const ln = normalizeName(getLastName(prop.player_name))
    const m  = byFull.get(fn) || (ln ? byLast.get(ln) : null)
    if (m) matched.push({ ...prop, player_id: m.id, player_name: m.name })
  }
  return matched
}

// ---------------------------------------------------------------------------
// Card reconciliation — band-aware
// ---------------------------------------------------------------------------

function isInBand(odds, band) {
  return odds >= band.low && odds <= band.high
}

function findInBandReplacement(pool, usedKeys, band) {
  return pool.find(p =>
    !usedKeys.has(`${p.player_id}|${p.stat_type}`) &&
    p.american_odds != null &&
    isInBand(p.american_odds, band)
  )
}

function buildReplacementSquare(originalId, prop) {
  return {
    id:            originalId,
    player_id:     prop.player_id,
    player_name:   prop.player_name,
    stat_type:     prop.stat_type,
    threshold:     prop.threshold,
    display_text:  prop.display_text,
    american_odds: prop.american_odds,
    implied_prob:  prop.implied_prob,
    tier:          prop.tier,
    conflict_key:  prop.conflict_key,
    marked:        false,
  }
}

/**
 * Reconcile cards after an odds refresh.
 *
 * - Silent threshold/odds update if the prop is still in-band
 * - Replace the square if odds drifted outside the band
 * - Replace the square if the player is gone entirely (injury/rulout)
 * - Never touch marked squares or swapped squares
 *
 * @param {Object} supabase    - Supabase client
 * @param {string} roomId      - Room ID
 * @param {Array}  newPool     - Updated matched prop pool
 * @param {number} playerCount - Current participant count (for band calculation)
 */
export async function reconcileCards(supabase, roomId, newPool, playerCount = 5) {
  const band       = getBand(playerCount)
  const newLookup  = new Map(newPool.map(p => [`${p.player_id}|${p.stat_type}`, p]))
  const newPlayerIds = new Set(newPool.map(p => p.player_id))

  const { data: cards, error: cardsErr } = await supabase
    .from('cards')
    .select('id, user_id, squares, swap_count, swapped_indices')
    .eq('room_id', roomId)

  if (cardsErr || !cards?.length) return

  for (const card of cards) {
    const squares = card.squares
    if (!squares || squares.length < 25) continue

    const swappedIndices = new Set((card.swapped_indices ?? []).map(Number))
    let changed = false
    const newSquares = [...squares]

    for (let i = 0; i < 25; i++) {
      const sq = squares[i]
      if (!sq || i === 12 || sq.stat_type === 'free') continue
      if (sq.marked === true || sq.marked === 'true') continue
      if (swappedIndices.has(i)) continue

      const key     = `${sq.player_id}|${sq.stat_type}`
      const newProp = newLookup.get(key)

      // Build a set of keys already on this card (excluding current square)
      // so we don't replace with a duplicate
      const usedKeys = new Set(
        newSquares
          .filter((s, j) => j !== i && s?.stat_type !== 'free')
          .map(s => `${s.player_id}|${s.stat_type}`)
      )

      if (newProp) {
        if (newProp.american_odds !== sq.american_odds) {
          if (isInBand(newProp.american_odds, band)) {
            // Still in band — silently update the line value
            newSquares[i] = {
              ...sq,
              threshold:     newProp.threshold,
              american_odds: newProp.american_odds,
              implied_prob:  newProp.implied_prob,
              display_text:  newProp.display_text,
            }
            changed = true
          } else {
            // Drifted out of band — replace with an in-band prop
            const replacement = findInBandReplacement(newPool, usedKeys, band)
            if (replacement) {
              newSquares[i] = buildReplacementSquare(sq.id, replacement)
              changed = true
            }
            // No in-band replacement available — keep the existing square
          }
        }
        // Odds unchanged — leave square untouched
      } else if (!newPlayerIds.has(sq.player_id)) {
        // Player gone entirely — replace with an in-band prop
        const replacement = findInBandReplacement(newPool, usedKeys, band)
        if (replacement) {
          newSquares[i] = buildReplacementSquare(sq.id, replacement)
          changed = true
        }
      }
    }

    if (changed) {
      await supabase.from('cards').update({ squares: newSquares }).eq('id', card.id)
    }
  }
}
