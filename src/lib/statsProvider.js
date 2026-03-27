const ESPN_SCOREBOARD      = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard'
const ESPN_SUMMARY         = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary'
const ESPN_NCAA_SCOREBOARD = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard'
const ESPN_NCAA_SUMMARY    = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/summary'
const ESPN_MLB_SCOREBOARD  = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard'
const ESPN_MLB_SUMMARY     = 'https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary'

function getEndpoints(sport) {
  if (sport === 'ncaa') {
    return { scoreboard: `${ESPN_NCAA_SCOREBOARD}?groups=100&limit=100`, summary: ESPN_NCAA_SUMMARY }
  }
  if (sport === 'mlb') {
    return { scoreboard: ESPN_MLB_SCOREBOARD, summary: ESPN_MLB_SUMMARY }
  }
  return { scoreboard: ESPN_SCOREBOARD, summary: ESPN_SUMMARY }
}

const STAT_THRESHOLDS = {
  points:   [25, 20, 15, 10],
  rebounds: [10, 5],
  assists:  [10, 5],
}

function parsePlayerStats(athlete, period) {
  const events = []
  const pid = String(athlete.athlete?.id ?? '')
  const pname = athlete.athlete?.displayName ?? ''
  if (!pid) return events

  const stats = athlete.stats ?? []

  // Require at least 6 values to have meaningful data (MIN PTS REB AST STL BLK).
  // Fewer than that means the array is truncated or malformed — skip the player.
  if (stats.length < 6) {
    console.warn(`statsProvider: skipping ${pname} (${pid}) — stats array too short (${stats.length}) for positional parsing`)
    return events
  }

  // ESPN standard order: MIN PTS REB AST STL BLK TO FG 3PT FT +/-
  // This is a best-effort fallback; mapStatsByLabel() is preferred.
  console.warn(
    `statsProvider: using positional fallback for ${pname} (${pid}) — ` +
    'labels were missing or unrecognised. Check ESPN response for this game.'
  )

  const pts = Number(stats[1]) || 0
  const reb = Number(stats[2]) || 0
  const ast = Number(stats[3]) || 0
  const stl = Number(stats[4]) || 0
  const blk = Number(stats[5]) || 0
  // Index 8 is 3PT in the standard layout; fall back to index 7 if absent.
  const threes = parseThreePointers(stats[8] ?? stats[7] ?? '0')

  for (const threshold of STAT_THRESHOLDS.points) {
    if (pts >= threshold) {
      events.push({ player_id: pid, player_name: pname, stat_type: `points_${threshold}`, value: pts, period })
    }
  }
  // Generic format for odds-based cards
  if (pts > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'points', value: pts, period })

  for (const threshold of STAT_THRESHOLDS.rebounds) {
    if (reb >= threshold) {
      events.push({ player_id: pid, player_name: pname, stat_type: `rebound_${threshold}`, value: reb, period })
    }
  }
  if (reb > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'rebounds', value: reb, period })

  for (const threshold of STAT_THRESHOLDS.assists) {
    if (ast >= threshold) {
      events.push({ player_id: pid, player_name: pname, stat_type: `assist_${threshold}`, value: ast, period })
    }
  }
  if (ast > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'assists', value: ast, period })

  if (threes >= 1) {
    events.push({ player_id: pid, player_name: pname, stat_type: 'three_pointer', value: threes, period })
    events.push({ player_id: pid, player_name: pname, stat_type: 'threes', value: threes, period })
  }
  if (stl >= 1) {
    events.push({ player_id: pid, player_name: pname, stat_type: 'steal', value: stl, period })
    events.push({ player_id: pid, player_name: pname, stat_type: 'steals', value: stl, period })
  }
  if (blk >= 1) {
    events.push({ player_id: pid, player_name: pname, stat_type: 'block', value: blk, period })
    events.push({ player_id: pid, player_name: pname, stat_type: 'blocks', value: blk, period })
  }

  // Combo stats for PRA / PR / PA / RA props
  if (pts + reb + ast > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'pts_reb_ast', value: pts + reb + ast, period })
  if (pts + reb > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'pts_reb',     value: pts + reb,       period })
  if (pts + ast > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'pts_ast',     value: pts + ast,       period })
  if (reb + ast > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'reb_ast',     value: reb + ast,       period })

  return events
}

function parseThreePointers(fgStr) {
  // ESPN formats 3PT as "made-attempted", e.g. "3-7"
  const match = String(fgStr).match(/^(\d+)/)
  return match ? Number(match[1]) : 0
}

/**
 * Parse a stat value that may be in "made-attempted" format (e.g. "5-12")
 * or a plain number. Returns the "made" portion for compound values.
 */
function parseStatValue(raw) {
  const str = String(raw ?? '0')
  const dashMatch = str.match(/^(\d+)-(\d+)$/)
  if (dashMatch) return Number(dashMatch[1])
  return Number(str) || 0
}

async function fetchJson(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`ESPN fetch failed: ${res.status} ${res.statusText} for ${url}`)
  return res.json()
}

// ---------------------------------------------------------------------------
// MLB stat parsers
// ---------------------------------------------------------------------------

function parseMLBBatterStats(entry, statLabels, period) {
  const events = []
  const pid = String(entry.athlete?.id ?? '')
  const pname = entry.athlete?.displayName ?? ''
  if (!pid || !statLabels.length || !entry.stats?.length) return events

  const statMap = {}
  statLabels.forEach((label, i) => { statMap[label.toUpperCase()] = entry.stats[i] ?? '0' })

  const h  = parseStatValue(statMap['H'])
  const hr = parseStatValue(statMap['HR'])
  const rbi = parseStatValue(statMap['RBI'])
  const r  = parseStatValue(statMap['R'])
  const bb = parseStatValue(statMap['BB'])
  const so = parseStatValue(statMap['SO'])
  const doubles = parseStatValue(statMap['2B'])
  const triples = parseStatValue(statMap['3B'])

  // TB = H + extra bases: doubles +1, triples +2, HRs +3
  const tb = h + doubles + 2 * triples + 3 * hr
  const singles = Math.max(0, h - hr - doubles - triples)
  const hrr = h + r + rbi

  if (h > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'hits',              value: h,       period })
  if (hr > 0)      events.push({ player_id: pid, player_name: pname, stat_type: 'home_runs',         value: hr,      period })
  if (rbi > 0)     events.push({ player_id: pid, player_name: pname, stat_type: 'rbi',               value: rbi,     period })
  if (r > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'runs',              value: r,       period })
  if (bb > 0)      events.push({ player_id: pid, player_name: pname, stat_type: 'walks_batter',      value: bb,      period })
  if (so > 0)      events.push({ player_id: pid, player_name: pname, stat_type: 'strikeouts_batter', value: so,      period })
  if (tb > 0)      events.push({ player_id: pid, player_name: pname, stat_type: 'total_bases',       value: tb,      period })
  if (singles > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'singles',           value: singles, period })
  if (doubles > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'doubles',           value: doubles, period })
  if (hrr > 0)     events.push({ player_id: pid, player_name: pname, stat_type: 'hits_runs_rbis',    value: hrr,     period })

  return events
}

function parseMLBPitcherStats(entry, statLabels, period) {
  const events = []
  const pid = String(entry.athlete?.id ?? '')
  const pname = entry.athlete?.displayName ?? ''
  if (!pid || !statLabels.length || !entry.stats?.length) return events

  const statMap = {}
  statLabels.forEach((label, i) => { statMap[label.toUpperCase()] = entry.stats[i] ?? '0' })

  const so = parseStatValue(statMap['SO'])
  const h  = parseStatValue(statMap['H'])
  const er = parseStatValue(statMap['ER'])

  // IP is "6.1" = 6 full innings + 1 out → 19 total outs
  const ipStr = String(statMap['IP'] ?? '0')
  const ipParts = ipStr.split('.')
  const outs = (parseInt(ipParts[0], 10) || 0) * 3 + (parseInt(ipParts[1], 10) || 0)

  if (so > 0)   events.push({ player_id: pid, player_name: pname, stat_type: 'strikeouts_pitcher', value: so,   period })
  if (h >= 0)   events.push({ player_id: pid, player_name: pname, stat_type: 'hits_allowed',       value: h,    period })
  if (er >= 0)  events.push({ player_id: pid, player_name: pname, stat_type: 'earned_runs',        value: er,   period })
  if (outs > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'outs_pitched',       value: outs, period })

  return events
}

function parseMLBBoxscore(data) {
  const competition = data.header?.competitions?.[0]
  const statusObj = competition?.status ?? {}
  const period = statusObj.period ?? 0
  const events = []
  const ruledOutPlayers = []
  const boxscorePlayerIds = new Set()

  for (const team of (data.boxscore?.players ?? [])) {
    const battingGroup  = team.statistics?.[0]
    const pitchingGroup = team.statistics?.[1]

    if (battingGroup) {
      const labels = battingGroup.labels ?? []
      for (const entry of (battingGroup.athletes ?? [])) {
        if (entry.athlete?.id) boxscorePlayerIds.add(String(entry.athlete.id))
        if (!entry.stats?.length || entry.didNotPlay) continue
        events.push(...parseMLBBatterStats(entry, labels, period))
      }
    }

    if (pitchingGroup) {
      const labels = pitchingGroup.labels ?? []
      for (const entry of (pitchingGroup.athletes ?? [])) {
        if (entry.athlete?.id) boxscorePlayerIds.add(String(entry.athlete.id))
        if (!entry.stats?.length || entry.didNotPlay) continue
        events.push(...parseMLBPitcherStats(entry, labels, period))
      }
    }
  }

  const competitors = competition?.competitors ?? []
  const home = competitors.find(c => c.homeAway === 'home')
  const away = competitors.find(c => c.homeAway === 'away')

  const gameStatus = {
    period,
    clock: statusObj.displayClock ?? null,
    homeScore: parseInt(home?.score ?? '0', 10),
    awayScore: parseInt(away?.score ?? '0', 10),
    statusDetail: statusObj.type?.shortDetail ?? statusObj.type?.detail ?? null,
  }

  return { events, gameStatus, ruledOutPlayers, boxscorePlayerIds }
}

/**
 * Fetch live stat events AND game status from ESPN in a single API call.
 * @param {string} espnGameId
 * @param {'nba'|'ncaa'|'mlb'} sport
 * @returns {Promise<{events: Array, gameStatus: {period, clock, homeScore, awayScore, statusDetail}}>}
 */
async function fetchEspnStatsAndStatus(espnGameId, sport = 'nba') {
  const { summary } = getEndpoints(sport)
  const data = await fetchJson(`${summary}?event=${espnGameId}`)

  if (sport === 'mlb') return parseMLBBoxscore(data)

  const boxScore = data.boxscore
  const competition = data.header?.competitions?.[0]
  const statusObj = competition?.status ?? {}
  const period = statusObj.period ?? 0
  const events = []

  // Injury tracking — collected across all teams in a single pass
  const ruledOutPlayers = []
  const boxscorePlayerIds = new Set()

  if (boxScore?.players?.length) {
    for (const team of boxScore.players) {
      const statLabels = team.statistics?.[0]?.labels ?? []
      const athletes = team.statistics?.[0]?.athletes ?? []

      for (const athlete of athletes) {
        // Always track every athlete ESPN lists in the boxscore
        if (athlete.athlete?.id) {
          boxscorePlayerIds.add(String(athlete.athlete.id))
        }

        // Collect players ESPN has officially marked as did-not-play
        if (athlete.didNotPlay === true && athlete.athlete?.id) {
          ruledOutPlayers.push({
            id: String(athlete.athlete.id),
            name: athlete.athlete.displayName ?? '',
            reason: athlete.reason ?? 'DNP',
          })
        }

        // Skip DNP / stat-less athletes for event generation
        if (!athlete.stats?.length || athlete.didNotPlay) continue

        const mapped = mapStatsByLabel(athlete, statLabels, period)
        if (mapped.length > 0) {
          events.push(...mapped)
        } else if (statLabels.length === 0) {
          events.push(...parsePlayerStats(athlete, period))
        } else {
          const pname = athlete.athlete?.displayName ?? 'unknown'
          console.warn(
            `statsProvider: mapStatsByLabel returned 0 events for ${pname} ` +
            `with labels [${statLabels.join(', ')}], stats [${(athlete.stats ?? []).slice(0, 5).join(', ')}...]. Trying positional fallback.`
          )
          events.push(...parsePlayerStats(athlete, period))
        }
      }
    }
  }

  const competitors = competition?.competitors ?? []
  const home = competitors.find(c => c.homeAway === 'home')
  const away = competitors.find(c => c.homeAway === 'away')

  const gameStatus = {
    period: statusObj.period ?? 0,
    clock: statusObj.displayClock ?? null,
    homeScore: parseInt(home?.score ?? '0', 10),
    awayScore: parseInt(away?.score ?? '0', 10),
    statusDetail: statusObj.type?.shortDetail ?? statusObj.type?.detail ?? null,
  }

  return { events, gameStatus, ruledOutPlayers, boxscorePlayerIds }
}

// ---------------------------------------------------------------------------
// Label aliases: maps every known ESPN variant to a single canonical key.
// Keeps mapStatsByLabel() robust against ESPN API inconsistencies.
// ---------------------------------------------------------------------------
const LABEL_ALIASES = {
  // Points
  PTS: 'PTS', POINTS: 'PTS',
  // Rebounds (total)
  REB: 'REB', REBS: 'REB', TRB: 'REB', TR: 'REB',
  // Offensive / defensive rebounds — summed into REB when REB is absent
  OR: 'OREB', OREB: 'OREB', OFF: 'OREB',
  DR: 'DREB', DREB: 'DREB', DEF: 'DREB',
  // Assists
  AST: 'AST', ASSISTS: 'AST', AS: 'AST',
  // Steals
  STL: 'STL', STEALS: 'STL', ST: 'STL',
  // Blocks
  BLK: 'BLK', BLOCKS: 'BLK', BS: 'BLK',
  // Three-pointers made (all ESPN variants)
  '3PT': '3PM', '3PM': '3PM', '3P': '3PM', FG3: '3PM', '3FGM': '3PM',
  // Field goals (not directly used, but normalised to avoid confusion
  // with positional slots when labels are iterated)
  FGM: 'FGM', FGA: 'FGA', FG: 'FGM',
  FTM: 'FTM', FTA: 'FTA', FT: 'FTM',
  // Turnovers / plus-minus — captured so they don't shadow other slots
  TO: 'TO', TOV: 'TO', TU: 'TO',
  '+/-': 'PM', PM: 'PM',
  // Minutes
  MIN: 'MIN',
  // Compound labels (NCAA "MADE-ATTEMPTED" single-column format)
  'FGM-FGA': 'FGM', 'FG-FGA': 'FGM',
  '3FGM-3FGA': '3PM', '3FG-3FGA': '3PM', '3PM-3PA': '3PM', 'FG3M-FG3A': '3PM',
  'FTM-FTA': 'FTM', 'FT-FTA': 'FTM',
  // Additional NCAA single-column variants
  '3FG': '3PM', FG3M: '3PM', FG3: '3PM',
  PF: 'PF', FOULS: 'PF',
}

/**
 * Label-aware stat mapping. More reliable than positional indexing.
 * Returns an empty array only when pid is missing — never due to label
 * variants, thanks to LABEL_ALIASES normalisation above.
 */
function mapStatsByLabel(athlete, labels, period) {
  const events = []
  const pid = String(athlete.athlete?.id ?? '')
  const pname = athlete.athlete?.displayName ?? ''
  if (!pid || !labels.length) return events

  // Build a normalised stat map keyed by canonical label names.
  const statMap = {}
  labels.forEach((label, i) => {
    const canonical = LABEL_ALIASES[label.toUpperCase()] ?? label.toUpperCase()
    // First occurrence wins; don't let a later duplicate overwrite.
    if (!(canonical in statMap)) {
      statMap[canonical] = athlete.stats[i] ?? '0'
    }
  })

  const KNOWN_CANONICAL = new Set(['PTS', 'REB', 'OREB', 'DREB', 'AST', 'STL', 'BLK', '3PM', 'MIN', 'FGM', 'FGA', 'FTM', 'FTA', 'TO', 'PM', 'PF'])
  const unmapped = Object.keys(statMap).filter(k => !KNOWN_CANONICAL.has(k))
  if (unmapped.length > 0) {
    console.warn(`statsProvider: unmapped labels for ${pname}: [${unmapped.join(', ')}] — raw: [${labels.join(', ')}]`)
  }

  const pts = parseStatValue(statMap['PTS'])
  const stl = parseStatValue(statMap['STL'])
  const blk = parseStatValue(statMap['BLK'])
  const threes = parseStatValue(statMap['3PM'])

  // Prefer the explicit total rebounds label; fall back to OR + DR sum.
  let reb = parseStatValue(statMap['REB'])
  if (!reb && (statMap['OREB'] !== undefined || statMap['DREB'] !== undefined)) {
    reb = parseStatValue(statMap['OREB']) + parseStatValue(statMap['DREB'])
  }

  const ast = parseStatValue(statMap['AST'])

  for (const threshold of STAT_THRESHOLDS.points) {
    if (pts >= threshold) {
      events.push({ player_id: pid, player_name: pname, stat_type: `points_${threshold}`, value: pts, period })
    }
  }
  if (pts > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'points', value: pts, period })

  for (const threshold of STAT_THRESHOLDS.rebounds) {
    if (reb >= threshold) {
      events.push({ player_id: pid, player_name: pname, stat_type: `rebound_${threshold}`, value: reb, period })
    }
  }
  if (reb > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'rebounds', value: reb, period })

  for (const threshold of STAT_THRESHOLDS.assists) {
    if (ast >= threshold) {
      events.push({ player_id: pid, player_name: pname, stat_type: `assist_${threshold}`, value: ast, period })
    }
  }
  if (ast > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'assists', value: ast, period })

  if (threes >= 1) {
    events.push({ player_id: pid, player_name: pname, stat_type: 'three_pointer', value: threes, period })
    events.push({ player_id: pid, player_name: pname, stat_type: 'threes', value: threes, period })
  }
  if (stl >= 1) {
    events.push({ player_id: pid, player_name: pname, stat_type: 'steal', value: stl, period })
    events.push({ player_id: pid, player_name: pname, stat_type: 'steals', value: stl, period })
  }
  if (blk >= 1) {
    events.push({ player_id: pid, player_name: pname, stat_type: 'block', value: blk, period })
    events.push({ player_id: pid, player_name: pname, stat_type: 'blocks', value: blk, period })
  }

  // Combo stats for PRA / PR / PA / RA props
  if (pts + reb + ast > 0) events.push({ player_id: pid, player_name: pname, stat_type: 'pts_reb_ast', value: pts + reb + ast, period })
  if (pts + reb > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'pts_reb',     value: pts + reb,       period })
  if (pts + ast > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'pts_ast',     value: pts + ast,       period })
  if (reb + ast > 0)       events.push({ player_id: pid, player_name: pname, stat_type: 'reb_ast',     value: reb + ast,       period })

  return events
}

/**
 * Fetch today's live ESPN game IDs from the scoreboard.
 * @param {'nba'|'ncaa'} sport
 * @returns {Promise<Array<{id: string, name: string, status: string}>>}
 */
async function fetchLiveEspnGames(sport = 'nba') {
  const { scoreboard } = getEndpoints(sport)
  const data = await fetchJson(scoreboard)
  const games = []
  for (const event of data.events ?? []) {
    const status = event.status?.type?.name ?? ''
    games.push({
      id: String(event.id),
      name: event.name ?? '',
      status,
    })
  }
  return games
}

// ---------------------------------------------------------------------------
// Mock fallback (same players/stat types as the card generator)
// ---------------------------------------------------------------------------

const MOCK_PLAYERS = [
  { id: '2544',   name: 'LeBron James' },
  { id: '3975',   name: 'Stephen Curry' },
  { id: '3032977', name: 'Giannis Antetokounmpo' },
  { id: '3112335', name: 'Nikola Jokić' },
  { id: '3202',   name: 'Kevin Durant' },
  { id: '4065648', name: 'Jayson Tatum' },
  { id: '3945274', name: 'Luka Dončić' },
  { id: '3059318', name: 'Joel Embiid' },
  { id: '3136193', name: 'Devin Booker' },
  { id: '3908809', name: 'Donovan Mitchell' },
]

const MOCK_STAT_TYPES = [
  { stat_type: 'points_10',     min: 10, max: 45 },
  { stat_type: 'points_15',     min: 15, max: 50 },
  { stat_type: 'points_20',     min: 20, max: 50 },
  { stat_type: 'points_25',     min: 25, max: 55 },
  { stat_type: 'three_pointer', min: 1,  max: 8 },
  { stat_type: 'rebound_5',     min: 5,  max: 18 },
  { stat_type: 'rebound_10',    min: 10, max: 20 },
  { stat_type: 'assist_5',      min: 5,  max: 15 },
  { stat_type: 'assist_10',     min: 10, max: 18 },
  { stat_type: 'steal',         min: 1,  max: 5 },
  { stat_type: 'block',         min: 1,  max: 5 },
  // Generic types for odds-based cards
  { stat_type: 'points',        min: 8,  max: 45 },
  { stat_type: 'rebounds',      min: 3,  max: 18 },
  { stat_type: 'assists',       min: 2,  max: 15 },
  { stat_type: 'threes',        min: 1,  max: 8 },
  { stat_type: 'steals',        min: 1,  max: 5 },
  { stat_type: 'blocks',        min: 1,  max: 5 },
  // Combo types
  { stat_type: 'pts_reb_ast',   min: 20, max: 65 },
  { stat_type: 'pts_reb',       min: 15, max: 50 },
  { stat_type: 'pts_ast',       min: 12, max: 45 },
  { stat_type: 'reb_ast',       min: 5,  max: 25 },
]

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateMockEvents(gameId) {
  const count = randomInt(1, 3)
  const events = []
  for (let i = 0; i < count; i++) {
    const player = pick(MOCK_PLAYERS)
    const st = pick(MOCK_STAT_TYPES)
    events.push({
      game_id: gameId,
      player_id: player.id,
      player_name: player.name,
      stat_type: st.stat_type,
      value: randomInt(st.min, st.max),
      period: randomInt(1, 4),
    })
  }
  return events
}

/**
 * Get stat events for a game_id.
 * Uses ESPN if source === 'espn', otherwise generates mock data.
 * Falls back to mock if ESPN fetch fails.
 *
 * @param {string} gameId
 * @param {'espn'|'mock'} source
 * @param {'nba'|'ncaa'} sport
 * @returns {Promise<Array<{game_id, player_id, player_name, stat_type, value, period}>>}
 */
async function getStatsForGame(gameId, source = 'mock', sport = 'nba') {
  if (source === 'espn') {
    try {
      const { events, gameStatus, ruledOutPlayers, boxscorePlayerIds } = await fetchEspnStatsAndStatus(gameId, sport)
      return {
        events: events.map((ev) => ({ ...ev, game_id: gameId })),
        gameStatus,
        ruledOutPlayers,
        boxscorePlayerIds,
      }
    } catch (err) {
      console.warn(`statsProvider: ESPN fetch failed for ${gameId}, falling back to mock:`, err.message)
      return { events: generateMockEvents(gameId), gameStatus: null, ruledOutPlayers: [], boxscorePlayerIds: new Set() }
    }
  }
  return { events: generateMockEvents(gameId), gameStatus: null, ruledOutPlayers: [], boxscorePlayerIds: new Set() }
}

export {
  getStatsForGame,
  fetchLiveEspnGames,
  generateMockEvents,
  MOCK_PLAYERS,
}
