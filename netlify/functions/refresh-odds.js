/**
 * Netlify scheduled function (runs every 5 minutes).
 *
 * Pre-fetches and stores real player prop odds onto lobby rooms so that
 * GamePage can read odds directly from room.odds_pool without hitting
 * TheOddsAPI at join time.
 *
 * Refresh cadence (based on time until game starts):
 *   > 2 hours away  : skip
 *   ≤ 2 hours        : refresh if last update > 30 min ago
 *   ≤ 1 hour         : refresh if last update > 15 min ago
 *   ≤ 10 min         : refresh if last update > 5 min ago
 *   pending (never checked): always refresh
 *
 * After updating odds, reconciles existing player cards — updating
 * thresholds/odds silently, and replacing squares for players who are
 * completely gone from the new pool (with a Dobs refund if they paid for
 * a swap).
 */

import { createClient } from '@supabase/supabase-js'

const ODDS_API_BASE = 'https://api.the-odds-api.com/v4'
const SPORT_KEY_MAP = { nba: 'basketball_nba', ncaa: 'basketball_ncaab' }
const VIG_FACTOR = 1.05
const MIN_UNIQUE_CONFLICT_KEYS = 16  // need 16+ distinct player+stat combos for a full card

// All markets in one string — TheOddsAPI counts a single /events/{id}/odds call
// regardless of how many markets are requested, so combining saves API budget.
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

const ESPN_SUMMARY_NBA  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'
const ESPN_SUMMARY_NCAA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary'
const ESPN_TEAMS_NBA    = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
const ESPN_TEAMS_NCAA   = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'

const MARKET_MAP = {
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

function assignTier(p) {
  return p >= 0.55 ? 1 : p >= 0.45 ? 2 : 3
}

function getLastName(name) {
  const parts = (name || '').trim().split(/\s+/)
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
  UCLA: ['ucla', 'bruins'],
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

function normalizeName(name) {
  return (name || '').toLowerCase().replace(/[^a-z]/g, '')
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// ESPN roster fetch
// ---------------------------------------------------------------------------

async function fetchRoster(gameId, sport) {
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
      players.push({
        id: String(a.id),
        name: a.displayName ?? '',
        lastName: getLastName(a.displayName ?? ''),
        team: teamName,
      })
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
          players.push({
            id: String(a.id),
            name: a.displayName ?? '',
            lastName: getLastName(a.displayName ?? ''),
            team: teamName,
          })
        }
      } catch (e) {
        console.warn(`refresh-odds: roster fetch failed for team ${teamId}:`, e.message)
      }
    }
  }

  return players
}

// ---------------------------------------------------------------------------
// TheOddsAPI fetch — event list cached per invocation, odds in one call
// ---------------------------------------------------------------------------

async function getEventList(sport, apiKey, ctx) {
  if (ctx.eventListCache.has(sport)) return ctx.eventListCache.get(sport)
  const sportKey = SPORT_KEY_MAP[sport] ?? SPORT_KEY_MAP.nba
  ctx.apiCallsMade++
  console.log(`refresh-odds: API call #${ctx.apiCallsMade} — event list for ${sport}`)
  const events = await fetchJson(`${ODDS_API_BASE}/sports/${sportKey}/events?apiKey=${apiKey}`)
  ctx.eventListCache.set(sport, events)
  return events
}

async function fetchOddsForRoom(room, apiKey, ctx) {
  const sport    = room.sport || 'nba'
  const sportKey = SPORT_KEY_MAP[sport] ?? SPORT_KEY_MAP.nba

  let eventId = room.oddsapi_event_id

  if (!eventId) {
    // First check — need to find the event in TheOddsAPI
    const nameParts = (room.name || '').split(' vs ')
    if (nameParts.length < 2) return { props: [], reason: 'bad_room_name' }

    const events = await getEventList(sport, apiKey, ctx)
    const matched = events.find(e =>
      (teamsMatch(e.home_team, nameParts[1]) && teamsMatch(e.away_team, nameParts[0])) ||
      (teamsMatch(e.home_team, nameParts[0]) && teamsMatch(e.away_team, nameParts[1]))
    )
    if (!matched) return { props: [], reason: 'no_matching_event' }
    eventId = matched.id
  }

  // Single API call with all markets combined
  ctx.apiCallsMade++
  console.log(`refresh-odds: API call #${ctx.apiCallsMade} — odds for ${room.game_id} (event ${eventId})`)
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

function matchOddsToRoster(oddsProps, rosterPlayers) {
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
// Card reconciliation
// ---------------------------------------------------------------------------

async function reconcileCards(supabase, roomId, newPool) {
  const newLookup    = new Map(newPool.map(p => [`${p.player_id}|${p.stat_type}`, p]))
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
      // Never touch squares the user explicitly paid to swap
      if (swappedIndices.has(i)) continue

      const key     = `${sq.player_id}|${sq.stat_type}`
      const newProp = newLookup.get(key)

      if (newProp) {
        // Player + stat still exists — silently update threshold/odds if changed
        if (newProp.threshold !== sq.threshold || newProp.american_odds !== sq.american_odds) {
          newSquares[i] = {
            ...sq,
            threshold:     newProp.threshold,
            american_odds: newProp.american_odds,
            implied_prob:  newProp.implied_prob,
            tier:          newProp.tier,
            display_text:  newProp.display_text,
          }
          changed = true
        }
      } else if (!newPlayerIds.has(sq.player_id)) {
        // Player completely gone — replace with a new prop
        const usedKeys = new Set(
          newSquares
            .filter((s, j) => j !== i && s?.stat_type !== 'free')
            .map(s => `${s.player_id}|${s.stat_type}`)
        )
        const replacement = newPool.find(p => !usedKeys.has(`${p.player_id}|${p.stat_type}`))
        if (replacement) {
          newSquares[i] = {
            id:            sq.id,
            player_id:     replacement.player_id,
            player_name:   replacement.player_name,
            stat_type:     replacement.stat_type,
            threshold:     replacement.threshold,
            display_text:  replacement.display_text,
            american_odds: replacement.american_odds,
            implied_prob:  replacement.implied_prob,
            tier:          replacement.tier,
            conflict_key:  replacement.conflict_key,
            marked:        false,
          }
          changed = true
        }
      }
    }

    if (changed) {
      await supabase.from('cards').update({ squares: newSquares }).eq('id', card.id)
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

// Process at most 5 rooms per invocation (event list caching keeps API calls low)
const MAX_ROOMS_PER_RUN = 5

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

  // Invocation-scoped state (not module-level — each call gets a fresh context)
  const ctx = { eventListCache: new Map(), apiCallsMade: 0 }

  const supabase = createClient(url, serviceKey)
  const now = new Date()
  const log = []

  const { data: rooms, error: roomsErr } = await supabase
    .from('rooms')
    .select('id, game_id, sport, name, starts_at, odds_pool, odds_updated_at, odds_status, oddsapi_event_id')
    .eq('room_type', 'public')
    .eq('status', 'lobby')

  if (roomsErr) {
    console.error('refresh-odds: rooms query failed', roomsErr)
    return { statusCode: 500, body: JSON.stringify({ error: roomsErr.message }) }
  }

  console.log(`refresh-odds: found ${rooms?.length ?? 0} lobby rooms`)

  // Prioritize: pending rooms first, then soonest start time
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

    const startsAt      = room.starts_at ? new Date(room.starts_at) : null
    const msUntilStart  = startsAt ? startsAt - now : Infinity
    const lastUpdate    = room.odds_updated_at ? new Date(room.odds_updated_at) : null
    const msSinceUpdate = lastUpdate ? now - lastUpdate : Infinity

    // Tiered refresh schedule — fetches as soon as room exists, then on approach
    let needsRefresh = false
    let refreshReason = ''

    if (room.odds_status === 'pending') {
      // Always fetch for new rooms regardless of how far away the game is
      needsRefresh = true
      refreshReason = 'first_check'
    } else if (msUntilStart > 6 * 60 * 60 * 1000) {
      // > 6h out: refresh every 3h (catches line-move updates day-of)
      if (msSinceUpdate > 3 * 60 * 60 * 1000) { needsRefresh = true; refreshReason = 'early_refresh' }
    } else if (msUntilStart > 2 * 60 * 60 * 1000) {
      // 2-6h out: refresh every 1h
      if (msSinceUpdate > 60 * 60 * 1000) { needsRefresh = true; refreshReason = 'midday_refresh' }
    } else if (msUntilStart > 30 * 60 * 1000) {
      // 30min-2h out: refresh every 20min
      if (msSinceUpdate > 20 * 60 * 1000) { needsRefresh = true; refreshReason = 'approach_refresh' }
    } else {
      // < 30min to tip: refresh every 5min for final injury updates
      if (msSinceUpdate > 5 * 60 * 1000) { needsRefresh = true; refreshReason = 'final_refresh' }
    }

    if (!needsRefresh) continue

    processed++
    console.log(`refresh-odds: processing ${room.game_id} (${room.name}) — status=${room.odds_status} reason=${refreshReason}`)

    try {
      // Fetch roster
      const roster = await fetchRoster(room.game_id, room.sport || 'nba')
      console.log(`refresh-odds: ${room.game_id} — roster: ${roster.length} players`)
      if (roster.length === 0) {
        log.push(`${room.game_id}: no roster — skipping`)
        continue
      }

      // Fetch odds (event list cached per invocation; all markets in one call)
      const { props, reason, eventId } = await fetchOddsForRoom(room, apiKey, ctx)
      console.log(`refresh-odds: ${room.game_id} — raw props: ${props.length}${reason ? ` (${reason})` : ''}`)

      if (props.length === 0) {
        await supabase
          .from('rooms')
          .update({ odds_status: 'insufficient', odds_updated_at: now.toISOString() })
          .eq('id', room.id)
        log.push(`${room.game_id}: insufficient odds (${reason})`)
        continue
      }

      // Persist the OddsAPI event ID so future checks skip the event-list lookup
      if (eventId && !room.oddsapi_event_id) {
        await supabase.from('rooms').update({ oddsapi_event_id: eventId }).eq('id', room.id)
      }

      // Match to roster
      const matched = matchOddsToRoster(props, roster)
      const uniqueKeys = new Set(matched.map(p => p.conflict_key))
      console.log(`refresh-odds: ${room.game_id} — matched: ${matched.length} lines, ${uniqueKeys.size} unique player+stat combos`)

      if (uniqueKeys.size < MIN_UNIQUE_CONFLICT_KEYS) {
        await supabase
          .from('rooms')
          .update({ odds_status: 'insufficient', odds_updated_at: now.toISOString() })
          .eq('id', room.id)
        log.push(`${room.game_id}: ${uniqueKeys.size} unique combos (need ${MIN_UNIQUE_CONFLICT_KEYS}), ${matched.length} total lines`)
        continue
      }

      const hadPreviousPool = (room.odds_pool ?? []).length > 0

      // Persist new pool
      await supabase
        .from('rooms')
        .update({ odds_pool: matched, odds_status: 'ready', odds_updated_at: now.toISOString() })
        .eq('id', room.id)

      // Reconcile existing cards if this is an update (not first-time load)
      if (hadPreviousPool) {
        await reconcileCards(supabase, room.id, matched)
      }

      refreshed++
      log.push(`${room.game_id}: ready — ${matched.length} lines, ${uniqueKeys.size} combos${hadPreviousPool ? ' (reconciled)' : ''}`)
    } catch (err) {
      log.push(`${room.game_id}: ERROR — ${err.message}`)
      console.error(`refresh-odds: failed for game ${room.game_id}:`, err)
    }
  }

  console.log('refresh-odds:', log.join(' | '))
  return {
    statusCode: 200,
    body: JSON.stringify({ refreshed, processed, apiCallsMade: ctx.apiCallsMade, total: rooms?.length ?? 0, log }),
    headers: { 'Content-Type': 'application/json' },
  }
}
