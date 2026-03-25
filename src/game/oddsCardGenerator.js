/**
 * Band-based card generator for Dabber.
 *
 * Every card has a single "band" of 100 American odds. All 24 props on the
 * card fall within that band. The band midpoint is determined by player count:
 * fewer players → more negative odds (easier to hit).
 * More players → more positive odds (harder to hit, rarer lines).
 *
 * Math:
 *   targetProb = 0.60 - (0.004 × clamp(playerCount, 1, 75))
 *   midpoint   = probToAmerican(targetProb)
 *   band       = [midpoint - 50, midpoint + 50]
 *
 * Example bands:
 *    1 player  → p≈0.596 → midpoint≈-147  → band [-197, -97]
 *    5 players → p=0.580 → midpoint≈-138  → band [-188, -88]
 *   10 players → p=0.560 → midpoint≈-127  → band [-177, -77]
 *   25 players → p=0.500 → midpoint≈-100  → band [-150, -50]
 *   40 players → p=0.440 → midpoint≈+127  → band [+77, +177]
 *   50 players → p=0.400 → midpoint≈+150  → band [+100, +200]
 *   75 players → p=0.300 → midpoint≈+233  → band [+183, +283]
 */

const TOTAL_SQUARES = 25
const CENTER_INDEX = 12
const BAND_WIDTH = 100  // American odds width on each side of midpoint

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
 * Calculate the band midpoint in American odds based on player count.
 *
 * Formula: target probability decreases linearly from 0.60 (1 player)
 * to ~0.30 (75+ players), producing a smooth difficulty curve.
 */
export function calculateBandMidpoint(playerCount) {
  const clamped = Math.max(1, Math.min(playerCount, 75))
  const targetProb = 0.60 - (0.004 * clamped)
  return probToAmerican(targetProb)
}

/**
 * Get the [low, high] band range for a given player count.
 * Returns American odds values. The band is always 100 wide on each side.
 *
 * Note: comparison for "is this prop in band" must handle the
 * negative/positive discontinuity by converting to implied probability.
 */
export function getBand(playerCount) {
  const mid = calculateBandMidpoint(playerCount)
  return {
    midpoint: mid,
    low: mid - Math.round(BAND_WIDTH / 2),
    high: mid + Math.round(BAND_WIDTH / 2),
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
 */
function buildCard(pool, targetMidpoint) {
  const targetProb = americanToProb(targetMidpoint)
  const tolerance  = 0.03  // ±3% implied probability tolerance for the average

  for (let attempt = 0; attempt < 50; attempt++) {
    const selected = []
    const usedConflictKeys  = new Set()
    const usedDisplayTexts  = new Set()

    for (const prop of shuffle(pool)) {
      if (selected.length >= 24) break
      if (usedConflictKeys.has(prop.conflict_key)) continue
      if (usedDisplayTexts.has(prop.display_text)) continue
      usedConflictKeys.add(prop.conflict_key)
      usedDisplayTexts.add(prop.display_text)
      selected.push(prop)
    }

    if (selected.length < 24) continue

    const avgProb = selected.reduce((sum, p) => sum + americanToProb(p.american_odds), 0) / selected.length
    if (Math.abs(avgProb - targetProb) <= tolerance) {
      return assembleCard(shuffle(selected))
    }
  }

  // Fallback: build the card even if the average isn't within tolerance
  const selected = []
  const usedConflictKeys = new Set()
  const usedDisplayTexts = new Set()
  for (const prop of shuffle(pool)) {
    if (selected.length >= 24) break
    if (usedConflictKeys.has(prop.conflict_key)) continue
    if (usedDisplayTexts.has(prop.display_text)) continue
    usedConflictKeys.add(prop.conflict_key)
    usedDisplayTexts.add(prop.display_text)
    selected.push(prop)
  }
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
 * fall within the band for the given player count.
 *
 * @param {Array}  matchedProps - output of matchOddsToRoster
 * @param {number} playerCount  - number of players in the room (determines band)
 * @returns {Array|null} flat 25-element array or null if insufficient props
 */
export function generateOddsBasedCard(matchedProps, playerCount = 5) {
  if (!matchedProps?.length) return null

  const band = getBand(playerCount)

  // Filter pool to props within the band
  const inBandPool = matchedProps.filter(p =>
    p.american_odds != null && isInBand(p.american_odds, band)
  )

  const uniqueKeys = new Set(inBandPool.map(p => p.conflict_key))
  if (uniqueKeys.size >= 16) {
    return buildCard(inBandPool, band.midpoint)
  }

  // Not enough props in the tight band — widen by 50 on each side
  const wideBand = { ...band, low: band.low - 50, high: band.high + 50 }
  const widePool = matchedProps.filter(p =>
    p.american_odds != null && isInBand(p.american_odds, wideBand)
  )
  const wideKeys = new Set(widePool.map(p => p.conflict_key))
  if (wideKeys.size < 16) return null

  return buildCard(widePool, band.midpoint)
}

/**
 * Find a single swap candidate (convenience wrapper).
 */
export function findSwapCandidate(originalSquare, fullPropPool, currentCardSquares, playerCount = 5) {
  const candidates = findSwapCandidates(originalSquare, fullPropPool, currentCardSquares, 1, playerCount)
  return candidates.length > 0 ? candidates[0] : null
}

/**
 * Find up to N swap candidates within the room's band and within ±30 odds
 * of the original square.
 *
 * @param {Object} originalSquare      - the square being replaced
 * @param {Array}  fullPropPool        - the full matched pool
 * @param {Array}  currentCardSquares  - all 25 squares currently on the card
 * @param {number} count               - max candidates to return (default 5)
 * @param {number} playerCount         - room player count (determines band)
 * @returns {Array} candidate props
 */
export function findSwapCandidates(originalSquare, fullPropPool, currentCardSquares, count = 5, playerCount = 5) {
  if (!fullPropPool?.length) return []
  const origOdds = originalSquare?.american_odds
  if (origOdds == null) return []

  const band = getBand(playerCount)

  const usedConflictKeys = new Set()
  const usedDisplayTexts = new Set()
  for (const sq of currentCardSquares ?? []) {
    if (sq?.conflict_key) usedConflictKeys.add(sq.conflict_key)
    if (sq?.display_text) usedDisplayTexts.add(sq.display_text)
  }

  // Candidates must be:
  // 1. Within the band (same difficulty zone)
  // 2. Within ±30 of the original square's odds (similar likelihood)
  // 3. Not already on the card
  const candidates = fullPropPool.filter(p =>
    p.american_odds != null &&
    isInBand(p.american_odds, band) &&
    Math.abs(p.american_odds - origOdds) <= 30 &&
    !usedConflictKeys.has(p.conflict_key) &&
    !usedDisplayTexts.has(p.display_text) &&
    p.display_text !== originalSquare.display_text
  )

  if (candidates.length === 0) return []
  return shuffle(candidates).slice(0, count)
}
