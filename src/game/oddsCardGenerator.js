/**
 * Band-based card generator for Dabber.
 *
 * Every card has a single "band" of American odds. All 24 props on the
 * card fall within that band. The band midpoint and width are sport-specific.
 *
 * NBA/NCAA: band width 100, targets -150 to -100 range for typical player counts
 * MLB: band width 120, caps at ±400 (no longshot garbage), no Infinity fallback
 */

const TOTAL_SQUARES = 25
const CENTER_INDEX = 12

// ---------------------------------------------------------------------------
// Sport-specific band configuration
// ---------------------------------------------------------------------------

const SPORT_BAND_CONFIG = {
  nba: {
    targetProb: (playerCount) => 0.60 - (0.004 * Math.max(1, Math.min(playerCount, 75))),
    bandWidth: 100,
    maxOdds: 500,
    minOdds: -500,
    wideningSteps: [0, 50, 100, 200, Infinity],
  },
  ncaa: {
    targetProb: (playerCount) => 0.60 - (0.004 * Math.max(1, Math.min(playerCount, 75))),
    bandWidth: 100,
    maxOdds: 500,
    minOdds: -500,
    wideningSteps: [0, 50, 100, 200, Infinity],
  },
  mlb: {
    targetProb: (playerCount) => 0.65 - (0.003 * Math.max(1, Math.min(playerCount, 75))),
    bandWidth: 120,
    maxOdds: 400,
    minOdds: -400,
    wideningSteps: [0, 40, 80, 150, Infinity],  // Fall back to full capped pool
  },
}

const MLB_MAX_PER_STAT = {
  hits: 5,
  total_bases: 5,
  home_runs: 3,
  rbis: 4,
  runs: 4,
  pitcher_strikeouts: 4,
}

function getSportBandConfig(sport) {
  return SPORT_BAND_CONFIG[sport] ?? SPORT_BAND_CONFIG.nba
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function randomId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function shuffle(arr) {
  const r = arr.slice()
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

function getLastName(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''
}

function normalizeName(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

// ---------------------------------------------------------------------------
// Band math
// ---------------------------------------------------------------------------

/**
 * Convert implied probability (0-1) to American odds.
 */
export function probToAmerican(prob) {
  if (prob >= 1) return -10000
  if (prob <= 0) return +10000
  if (prob >= 0.5) {
    return Math.round(-100 * prob / (1 - prob))
  } else {
    return Math.round(100 * (1 - prob) / prob)
  }
}

/**
 * Convert American odds to implied probability (0-1).
 */
export function americanToProb(odds) {
  if (odds < 0) return Math.abs(odds) / (Math.abs(odds) + 100)
  return 100 / (odds + 100)
}

/**
 * Calculate the band midpoint in American odds based on player count and sport.
 */
export function calculateBandMidpoint(playerCount, sport = 'nba') {
  const config = getSportBandConfig(sport)
  return probToAmerican(config.targetProb(playerCount))
}

/**
 * Get the [low, high] band range for a given player count and sport.
 */
export function getBand(playerCount, sport = 'nba') {
  const config = getSportBandConfig(sport)
  const mid = calculateBandMidpoint(playerCount, sport)
  const half = Math.round(config.bandWidth / 2)
  return {
    midpoint: mid,
    low: mid - half,
    high: mid + half,
  }
}

/**
 * Check if American odds fall within a band using direct numeric comparison.
 *
 * American odds form a discontinuous scale (no values between -100 and +100),
 * but direct comparison works correctly in practice because real prop odds
 * never appear in that dead zone. This avoids the probability-comparison bug
 * where +150 would fall inside a [-150, -50] band due to overlapping prob ranges.
 */
function isInBand(odds, band) {
  return odds >= band.low && odds <= band.high
}

// ---------------------------------------------------------------------------
// Roster matching
// ---------------------------------------------------------------------------

/**
 * Match odds props to ESPN roster players by name.
 * Only returns props that matched a roster player (with ESPN player_id attached).
 *
 * @param {Array} oddsProps - { player_name, stat_type, threshold, ... }
 * @param {Array} rosterPlayers - { id, name, lastName, ... }
 * @returns {Array} matched props with player_id attached
 */
export function matchOddsToRoster(oddsProps, rosterPlayers) {
  if (!rosterPlayers?.length) return []

  const byFullName = new Map()
  const byLastName = new Map()

  for (const player of rosterPlayers) {
    byFullName.set(normalizeName(player.name), player)
    const last = normalizeName(player.lastName || getLastName(player.name))
    if (last && !byLastName.has(last)) byLastName.set(last, player)
  }

  const matched = []
  for (const prop of oddsProps) {
    const fullNorm = normalizeName(prop.player_name)
    const lastNorm = normalizeName(getLastName(prop.player_name))
    const match = byFullName.get(fullNorm) || (lastNorm ? byLastName.get(lastNorm) : null)
    if (match) matched.push({ ...prop, player_id: match.id, player_name: match.name })
  }
  return matched
}

// ---------------------------------------------------------------------------
// Card assembly helpers
// ---------------------------------------------------------------------------

/**
 * Assemble the final 25-square card from 24 selected props.
 */
function assembleCard(selected) {
  const card = []
  let idx = 0
  for (let i = 0; i < TOTAL_SQUARES; i++) {
    if (i === CENTER_INDEX) {
      card.push({
        id: randomId(),
        player_id: null,
        player_name: null,
        stat_type: 'free',
        threshold: 0,
        display_text: 'FREE',
        american_odds: null,
        implied_prob: 1.0,
        tier: 0,
        conflict_key: null,
        marked: true,
      })
    } else {
      const p = selected[idx++]
      card.push({
        id: randomId(),
        player_id: p.player_id,
        player_name: p.player_name,
        team_abbr: p.team_abbr ?? '',
        stat_type: p.stat_type,
        threshold: p.threshold,
        display_text: p.display_text,
        american_odds: p.american_odds,
        implied_prob: p.implied_prob,
        tier: p.tier,  // kept for display dot color; not used in generation
        conflict_key: p.conflict_key,
        marked: false,
      })
    }
  }
  return card
}

/**
 * Build a card from a filtered pool, targeting an average near midpoint.
 * Tries 50 times; falls back to best-effort if tolerance never met.
 * statMaxPerType: optional map of stat_type → max occurrences (MLB diversity rule).
 */
function buildCard(pool, targetMidpoint, statMaxPerType = null) {
  const targetProb = americanToProb(targetMidpoint)
  const tolerance  = 0.03  // ±3% implied probability tolerance for the average

  function selectFrom(shuffled) {
    const selected = []
    const usedConflictKeys = new Set()
    const usedDisplayTexts = new Set()
    const statTypeCounts   = {}

    for (const prop of shuffled) {
      if (selected.length >= 24) break
      if (usedConflictKeys.has(prop.conflict_key)) continue
      if (usedDisplayTexts.has(prop.display_text)) continue
      if (statMaxPerType) {
        const st = prop.stat_type
        const max = statMaxPerType[st] ?? 4
        if ((statTypeCounts[st] ?? 0) >= max) continue
      }
      usedConflictKeys.add(prop.conflict_key)
      usedDisplayTexts.add(prop.display_text)
      statTypeCounts[prop.stat_type] = (statTypeCounts[prop.stat_type] ?? 0) + 1
      selected.push(prop)
    }
    return selected
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    const selected = selectFrom(shuffle(pool))
    if (selected.length < 24) continue

    const avgProb = selected.reduce((sum, p) => sum + americanToProb(p.american_odds), 0) / selected.length
    if (Math.abs(avgProb - targetProb) <= tolerance) {
      return assembleCard(shuffle(selected))
    }
  }

  // Fallback: build the card even if the average isn't within tolerance
  const selected = selectFrom(shuffle(pool))
  if (selected.length < 24) return null
  return assembleCard(shuffle(selected))
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate a bingo card from the prop pool using band-based selection.
 *
 * All 24 non-free squares are populated with props whose American odds
 * fall within the band for the given player count and sport.
 *
 * @param {Array}  matchedProps - output of matchOddsToRoster
 * @param {number} playerCount  - number of players in the room (determines band)
 * @param {string} sport        - 'nba' | 'ncaa' | 'mlb' (determines band config)
 * @returns {Array|null} flat 25-element array or null if insufficient props
 */
export function generateOddsBasedCard(matchedProps, playerCount = 5, sport = 'nba') {
  if (!matchedProps?.length) return null

  const config = getSportBandConfig(sport)
  const band = getBand(playerCount, sport)
  const halfWidth = Math.round(config.bandWidth / 2)
  const statMaxPerType = sport === 'mlb' ? MLB_MAX_PER_STAT : null

  // Pre-filter: remove props outside the sport's hard odds cap
  const capped = matchedProps.filter(p =>
    p.american_odds != null &&
    p.american_odds <= config.maxOdds &&
    p.american_odds >= config.minOdds
  )

  for (const extra of config.wideningSteps) {
    let pool
    if (extra === Infinity) {
      pool = capped
    } else {
      const low  = band.midpoint - halfWidth - extra
      const high = band.midpoint + halfWidth + extra
      pool = capped.filter(p => p.american_odds >= low && p.american_odds <= high)
    }

    const uniqueKeys = new Set(pool.map(p => p.conflict_key))
    if (uniqueKeys.size < 24) continue

    // Try with diversity constraints first; fall back to no constraint if pool
    // lacks enough stat-type variety (e.g. MLB games heavy on hits props)
    const card = buildCard(pool, band.midpoint, statMaxPerType) ?? buildCard(pool, band.midpoint, null)
    if (card) return card
  }

  // Truly insufficient — can't build a card at all
  return null
}

/**
 * Find a single swap candidate (convenience wrapper).
 */
export function findSwapCandidate(originalSquare, fullPropPool, currentCardSquares, playerCount = 5, sport = 'nba') {
  const candidates = findSwapCandidates(originalSquare, fullPropPool, currentCardSquares, 1, playerCount, sport)
  return candidates.length > 0 ? candidates[0] : null
}

/**
 * Find up to N swap candidates within the room's band and within ±30 odds
 * of the original square, respecting the sport's odds cap.
 *
 * @param {Object} originalSquare      - the square being replaced
 * @param {Array}  fullPropPool        - the full matched pool
 * @param {Array}  currentCardSquares  - all 25 squares currently on the card
 * @param {number} count               - max candidates to return (default 5)
 * @param {number} playerCount         - room player count (determines band)
 * @param {string} sport               - 'nba' | 'ncaa' | 'mlb'
 * @returns {Array} candidate props
 */
export function findSwapCandidates(originalSquare, fullPropPool, currentCardSquares, count = 5, playerCount = 5, sport = 'nba') {
  if (!fullPropPool?.length) return []
  const origOdds = originalSquare?.american_odds
  if (origOdds == null) return []

  const config = getSportBandConfig(sport)

  const usedConflictKeys = new Set()
  const usedDisplayTexts = new Set()
  for (const sq of currentCardSquares ?? []) {
    if (sq?.conflict_key) usedConflictKeys.add(sq.conflict_key)
    if (sq?.display_text) usedDisplayTexts.add(sq.display_text)
  }

  // Pre-filter by sport's hard odds cap
  const capped = fullPropPool.filter(p =>
    p.american_odds != null &&
    p.american_odds <= config.maxOdds &&
    p.american_odds >= config.minOdds
  )

  // Progressive odds range: try ±30 first, then widen to ±60, ±100, then any in pool
  const ranges = [30, 60, 100, Infinity]

  for (const range of ranges) {
    const candidates = capped.filter(p => {
      if (usedConflictKeys.has(p.conflict_key)) return false
      if (usedDisplayTexts.has(p.display_text)) return false
      if (p.display_text === originalSquare.display_text) return false
      if (range !== Infinity && Math.abs(p.american_odds - origOdds) > range) return false
      return true
    })

    if (candidates.length > 0) {
      return shuffle(candidates).slice(0, count)
    }
  }

  return []
}
