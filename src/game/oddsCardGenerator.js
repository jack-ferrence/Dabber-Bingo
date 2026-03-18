/**
 * Odds-based card generator for Dabber.
 *
 * Architecture matches the Super Bowl Prop Bingo system:
 * - Props come from TheOddsAPI with real American odds
 * - Cards have weighted tier quotas for balanced difficulty
 * - Conflict keys prevent redundant props (same player + same stat family)
 * - Every card has equal expected value but different specific props
 *
 * Tier quotas (24 non-free squares):
 *   Tier 1 (easy, >= 55% implied):  8 squares
 *   Tier 2 (medium, 45-54%):        10 squares
 *   Tier 3 (hard, < 45%):           6 squares
 */

const TIER_QUOTAS = { 1: 8, 2: 10, 3: 6 }
const TOTAL_SQUARES = 25
const CENTER_INDEX = 12
const MAX_PICK_ATTEMPTS = 100
const DIFFICULTY_BIAS = {
  1: 2.0,  // easy: strong weight
  2: 1.5,  // medium: moderate weight
  3: 1.0,  // hard: base weight
}

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

/**
 * Pick one prop from pool using weighted random, respecting conflict keys.
 */
function pickOneWeighted(pool, usedIds, usedConflictKeys, tier) {
  const candidates = pool.filter(p =>
    p.tier === tier &&
    !usedIds.has(p.display_text) &&
    !usedConflictKeys.has(p.conflict_key)
  )
  if (candidates.length === 0) return null

  const weights = candidates.map(c => DIFFICULTY_BIAS[c.tier] || 1)
  const total = weights.reduce((a, b) => a + b, 0)
  let roll = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    roll -= weights[i]
    if (roll <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

/**
 * Match odds props to ESPN roster players by name.
 * Only returns props that matched a roster player (with ESPN player_id attached).
 *
 * @param {Array} oddsProps - from get-odds.js: { player_name, stat_type, threshold, ... }
 * @param {Array} rosterPlayers - from get-roster: { id, name, lastName, ... }
 * @returns {Array} matched props with player_id attached
 */
export function matchOddsToRoster(oddsProps, rosterPlayers) {
  if (!rosterPlayers?.length) return []

  // Build lookup maps
  const byFullName = new Map()
  const byLastName = new Map()

  for (const player of rosterPlayers) {
    byFullName.set(normalizeName(player.name), player)
    const last = normalizeName(player.lastName || getLastName(player.name))
    if (last && !byLastName.has(last)) {
      byLastName.set(last, player)
    }
  }

  const matched = []
  for (const prop of oddsProps) {
    const fullNorm = normalizeName(prop.player_name)
    const lastNorm = normalizeName(getLastName(prop.player_name))
    const match = byFullName.get(fullNorm) || (lastNorm ? byLastName.get(lastNorm) : null)
    if (match) {
      matched.push({ ...prop, player_id: match.id, player_name: match.name })
    }
  }
  return matched
}

/**
 * Generate a single bingo card from matched odds props.
 * Returns flat array of 25 squares, or null if not enough props.
 *
 * @param {Array} matchedProps - output of matchOddsToRoster
 * @returns {Array|null} flat 25-element array or null if insufficient props
 */
export function generateOddsBasedCard(matchedProps) {
  if (!matchedProps?.length) return null

  const selected = []
  const usedIds = new Set()
  const usedConflictKeys = new Set()

  // Pick from each tier according to quotas
  for (const [tier, quota] of Object.entries(TIER_QUOTAS)) {
    let picked = 0
    const t = Number(tier)

    for (let attempt = 0; attempt < MAX_PICK_ATTEMPTS && picked < quota; attempt++) {
      const prop = pickOneWeighted(matchedProps, usedIds, usedConflictKeys, t)
      if (!prop) break
      usedIds.add(prop.display_text)
      usedConflictKeys.add(prop.conflict_key)
      selected.push(prop)
      picked++
    }

    // If quota not met, borrow from adjacent tier (deterministic: 1→2, 2→1, 3→2)
    if (picked < quota) {
      const fallbackTier = t === 2 ? 1 : 2
      for (let attempt = 0; attempt < MAX_PICK_ATTEMPTS && picked < quota; attempt++) {
        const prop = pickOneWeighted(matchedProps, usedIds, usedConflictKeys, fallbackTier)
        if (!prop) break
        usedIds.add(prop.display_text)
        usedConflictKeys.add(prop.conflict_key)
        selected.push(prop)
        picked++
      }
    }
  }

  // Need 24 non-free squares
  if (selected.length < 24) return null

  // Shuffle all 24 selected — completely random positions
  const shuffled = shuffle(selected)

  // Build 25-square card with FREE at center (index 12)
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
      const p = shuffled[idx++]
      card.push({
        id: randomId(),
        player_id: p.player_id,
        player_name: p.player_name,
        stat_type: p.stat_type,
        threshold: p.threshold,
        display_text: p.display_text,
        american_odds: p.american_odds,
        implied_prob: p.implied_prob,
        tier: p.tier,
        conflict_key: p.conflict_key,
        marked: false,
      })
    }
  }

  return card
}

/**
 * Find a swap candidate: a prop from the pool with American odds
 * within ±25 of the original, not already on the card, respecting conflict keys.
 *
 * @param {Object} originalSquare - the square being replaced (needs american_odds)
 * @param {Array}  fullPropPool   - output of matchOddsToRoster (the full matched pool)
 * @param {Array}  currentCardSquares - all 25 squares currently on the card
 * @returns {Object|null} a candidate prop (same shape as pool entry), or null
 */
export function findSwapCandidate(originalSquare, fullPropPool, currentCardSquares) {
  if (!fullPropPool?.length) return null
  const origOdds = originalSquare?.american_odds
  if (origOdds == null) return null

  const usedConflictKeys = new Set()
  const usedDisplayTexts = new Set()
  for (const sq of currentCardSquares ?? []) {
    if (sq?.conflict_key) usedConflictKeys.add(sq.conflict_key)
    if (sq?.display_text) usedDisplayTexts.add(sq.display_text)
  }

  const candidates = fullPropPool.filter(p =>
    p.american_odds != null &&
    Math.abs(p.american_odds - origOdds) <= 25 &&
    !usedConflictKeys.has(p.conflict_key) &&
    !usedDisplayTexts.has(p.display_text) &&
    p.display_text !== originalSquare.display_text
  )

  if (candidates.length === 0) return null
  return candidates[Math.floor(Math.random() * candidates.length)]
}
