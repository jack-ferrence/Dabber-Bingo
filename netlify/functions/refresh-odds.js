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
const MIN_PROPS = 24

const ESPN_SUMMARY_NBA  = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'
const ESPN_SUMMARY_NCAA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary'
const ESPN_TEAMS_NBA    = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams'
const ESPN_TEAMS_NCAA   = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/teams'

const MARKET_MAP = {
  player_points:                  { stat: 'points',      label: 'PTS' },
  player_rebounds:                { stat: 'rebounds',    label: 'REB' },
  player_assists:                 { stat: 'assists',     label: 'AST' },
  player_threes:                  { stat: 'threes',      label: '3PM' },
  player_steals:                  { stat: 'steals',      label: 'STL' },
  player_blocks:                  { stat: 'blocks',      label: 'BLK' },
  player_points_rebounds_assists: { stat: 'pts_reb_ast', label: 'PTS+REB+AST' },
  player_points_rebounds:         { stat: 'pts_reb',     label: 'PTS+REB' },
  player_points_assists:          { stat: 'pts_ast',     label: 'PTS+AST' },
  player_rebounds_assists:        { stat: 'reb_ast',     label: 'REB+AST' },
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
// TheOddsAPI fetch
// ---------------------------------------------------------------------------

async function fetchOddsForRoom(room, apiKey) {
  const sport    = room.sport || 'nba'
  const sportKey = SPORT_KEY_MAP[sport] ?? SPORT_KEY_MAP.nba

  // Room name format: "AWY vs HOM"
  const nameParts = (room.name || '').split(' vs ')
  if (nameParts.length < 2) return { props: [], reason: 'bad_room_name' }

  const events = await fetchJson(`${ODDS_API_BASE}/sports/${sportKey}/events?apiKey=${apiKey}`)
  const matched = events.find(e =>
    (teamsMatch(e.home_team, nameParts[1]) && teamsMatch(e.away_team, nameParts[0])) ||
    (teamsMatch(e.home_team, nameParts[0]) && teamsMatch(e.away_team, nameParts[1]))
  )
  if (!matched) return { props: [], reason: 'no_matching_event' }

  const oddsData = await fetchJson(
    `${ODDS_API_BASE}/sports/${sportKey}/events/${matched.id}/odds` +
    `?apiKey=${apiKey}&regions=us&markets=${MARKETS}&oddsFormat=american`
  )
  const book = oddsData.bookmakers?.[0]
  if (!book) return { props: [], reason: 'no_bookmakers' }

  const props = []
  const seen  = new Set()

  for (const market of (book.markets ?? [])) {
    const mapping = MARKET_MAP[market.key]
    if (!mapping) continue
    for (const oc of (market.outcomes ?? [])) {
      if (oc.name?.toLowerCase() !== 'over') continue
      const { description: playerName, point: threshold, price: americanOdds } = oc
      if (!playerName || threshold == null || typeof americanOdds !== 'number') continue

      const deVigged = deVig(americanToImplied(americanOdds))
      const label    = `${getLastName(playerName)} ${threshold}+ ${mapping.label}`
      if (seen.has(label)) continue
      seen.add(label)

      props.push({
        player_name:  playerName,
        stat_type:    mapping.stat,
        threshold,
        display_text: label,
        american_odds: americanOdds,
        implied_prob:  Math.round(deVigged * 1000) / 1000,
        tier:          assignTier(deVigged),
        conflict_key:  `${playerName}|${mapping.stat}`,
      })
    }
  }

  return { props, source: book.key }
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
    .select('id, user_id, squares, swap_count')
    .eq('room_id', roomId)

  if (cardsErr || !cards?.length) return

  for (const card of cards) {
    const squares = card.squares
    if (!squares || squares.length < 25) continue

    let changed = false
    const newSquares   = [...squares]
    let   refundAmount = 0
    const wasSwapped   = (card.swap_count ?? 0) > 0

    for (let i = 0; i < 25; i++) {
      const sq = squares[i]
      if (!sq || i === 12 || sq.stat_type === 'free') continue
      if (sq.marked === true || sq.marked === 'true') continue

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
        // Player completely gone — must replace with a new prop
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
          if (wasSwapped) refundAmount += 10 // Refund one swap cost per displaced square
        }
      }
    }

    if (changed) {
      await supabase.from('cards').update({ squares: newSquares }).eq('id', card.id)

      if (refundAmount > 0) {
        await supabase
          .rpc('refund_dabs', { p_user_id: card.user_id, p_amount: refundAmount, p_room_id: roomId })
          .catch(err => console.warn(`refresh-odds: refund failed for user ${card.user_id}:`, err.message))
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export async function handler() {
  const url        = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const apiKey     = process.env.ODDS_API_KEY

  if (!url || !serviceKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing SUPABASE env vars' }) }
  }
  if (!apiKey) {
    return { statusCode: 200, body: JSON.stringify({ skipped: true, reason: 'no_api_key' }) }
  }

  const supabase = createClient(url, serviceKey)
  const now = new Date()
  const log = []

  const { data: rooms, error: roomsErr } = await supabase
    .from('rooms')
    .select('id, game_id, sport, name, starts_at, odds_pool, odds_updated_at, odds_status')
    .eq('room_type', 'public')
    .eq('status', 'lobby')

  if (roomsErr) {
    console.error('refresh-odds: rooms query failed', roomsErr)
    return { statusCode: 500, body: JSON.stringify({ error: roomsErr.message }) }
  }

  let refreshed = 0

  for (const room of (rooms ?? [])) {
    const startsAt      = room.starts_at ? new Date(room.starts_at) : null
    const msUntilStart  = startsAt ? startsAt - now : Infinity
    const lastUpdate    = room.odds_updated_at ? new Date(room.odds_updated_at) : null
    const msSinceUpdate = lastUpdate ? now - lastUpdate : Infinity

    let needsRefresh = false
    if (room.odds_status === 'pending') {
      needsRefresh = true
    } else if (msUntilStart <= 10 * 60 * 1000 && msSinceUpdate > 5 * 60 * 1000) {
      needsRefresh = true
    } else if (msUntilStart <= 60 * 60 * 1000 && msSinceUpdate > 15 * 60 * 1000) {
      needsRefresh = true
    } else if (msUntilStart <= 2 * 60 * 60 * 1000 && msSinceUpdate > 30 * 60 * 1000) {
      needsRefresh = true
    }

    if (!needsRefresh) continue

    try {
      // Fetch roster
      const roster = await fetchRoster(room.game_id, room.sport || 'nba')
      if (roster.length === 0) {
        log.push(`${room.game_id}: no roster — skipping`)
        continue
      }

      // Fetch odds
      const { props, reason } = await fetchOddsForRoom(room, apiKey)
      if (props.length === 0) {
        await supabase
          .from('rooms')
          .update({ odds_status: 'insufficient', odds_updated_at: now.toISOString() })
          .eq('id', room.id)
        log.push(`${room.game_id}: insufficient odds (${reason})`)
        continue
      }

      // Match to roster
      const matched = matchOddsToRoster(props, roster)
      if (matched.length < MIN_PROPS) {
        await supabase
          .from('rooms')
          .update({ odds_status: 'insufficient', odds_updated_at: now.toISOString() })
          .eq('id', room.id)
        log.push(`${room.game_id}: only ${matched.length}/${MIN_PROPS} matched props`)
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
      log.push(`${room.game_id}: ready — ${matched.length} props${hadPreviousPool ? ' (reconciled)' : ''}`)
    } catch (err) {
      log.push(`${room.game_id}: ERROR — ${err.message}`)
      console.error(`refresh-odds: failed for game ${room.game_id}:`, err)
    }
  }

  console.log('refresh-odds:', log.join(' | '))
  return {
    statusCode: 200,
    body: JSON.stringify({ refreshed, total: rooms?.length ?? 0, log }),
    headers: { 'Content-Type': 'application/json' },
  }
}
