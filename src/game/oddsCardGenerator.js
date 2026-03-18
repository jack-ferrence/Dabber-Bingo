// Client-side card generator using TheOddsAPI prop pool.
// Produces a 25-square card with a specific difficulty mix:
//   10 easy + 7 medium + 5 hard + 2 longshot + 1 FREE (center, index 12)

const TIER_QUOTA = { easy: 10, medium: 7, hard: 5, longshot: 2 }
const TOTAL_NON_FREE = 24

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function shuffle(array) {
  const result = array.slice()
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

function getLastName(fullName) {
  const parts = (fullName ?? '').trim().split(/\s+/)
  return parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || ''
}

function normalizeName(name) {
  return (name ?? '').toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * Fuzzy match odds props to roster players, attaching player_id.
 * Tries full name match first, then last name match.
 * Props without a roster match are still included (player_id will be null).
 *
 * @param {Array} oddsProps - from get-odds.js: { player_name, stat_type, threshold, ... }
 * @param {Array} rosterPlayers - from get-roster: { id, name, lastName, ... }
 * @returns {Array} oddsProps with player_id attached
 */
export function matchOddsToRoster(oddsProps, rosterPlayers) {
  if (!rosterPlayers?.length) {
    return oddsProps.map((p) => ({ ...p, player_id: null }))
  }

  // Build lookup maps
  const byFullName = new Map()
  const byLastName = new Map()

  for (const player of rosterPlayers) {
    byFullName.set(normalizeName(player.name), player.id)
    const last = normalizeName(player.lastName || getLastName(player.name))
    if (last && !byLastName.has(last)) {
      byLastName.set(last, player.id)
    }
  }

  return oddsProps.map((prop) => {
    const fullNorm = normalizeName(prop.player_name)
    const lastNorm = normalizeName(getLastName(prop.player_name))

    const playerId = byFullName.get(fullNorm) ?? byLastName.get(lastNorm) ?? null
    return { ...prop, player_id: playerId }
  })
}

/**
 * Generate a 25-square odds-based bingo card.
 *
 * @param {Array} matchedProps - output of matchOddsToRoster
 * @returns {Array|null} flat 25-element array or null if insufficient props
 */
export function generateOddsBasedCard(matchedProps) {
  if (!matchedProps?.length) return null

  // Group by tier
  const byTier = { easy: [], medium: [], hard: [], longshot: [] }
  for (const prop of matchedProps) {
    if (byTier[prop.tier]) byTier[prop.tier].push(prop)
  }

  // Shuffle each tier pool
  for (const tier of Object.keys(byTier)) {
    byTier[tier] = shuffle(byTier[tier])
  }

  const selected = []
  const usedConflicts = new Set()

  function pickFromTier(tier, count) {
    const pool = byTier[tier]
    let picked = 0
    while (picked < count && pool.length > 0) {
      const prop = pool.shift()
      if (usedConflicts.has(prop.conflict_key)) continue
      usedConflicts.add(prop.conflict_key)
      selected.push({ ...prop, id: randomId(), marked: false })
      picked++
    }
    return picked
  }

  // Pick per quota; if a tier runs dry, borrow from adjacent tiers
  const tiers = ['easy', 'medium', 'hard', 'longshot']
  const remaining = { ...TIER_QUOTA }

  for (const tier of tiers) {
    const got = pickFromTier(tier, remaining[tier])
    const shortfall = remaining[tier] - got
    if (shortfall > 0) {
      // Borrow from the next tier in priority order
      const fallbacks = tiers.filter((t) => t !== tier)
      for (const fb of fallbacks) {
        if (shortfall <= 0) break
        const extra = pickFromTier(fb, shortfall)
        remaining[tier] -= extra
      }
    }
  }

  if (selected.length < TOTAL_NON_FREE) return null

  // Trim to exactly 24 and shuffle
  const shuffled = shuffle(selected.slice(0, TOTAL_NON_FREE))

  // Build 25-square card with FREE at index 12
  const card = []
  let idx = 0
  for (let i = 0; i < 25; i++) {
    if (i === 12) {
      card.push({
        id: randomId(),
        player_id: null,
        player_name: null,
        stat_type: 'free',
        threshold: 0,
        display_text: 'FREE',
        marked: true,
      })
    } else {
      card.push(shuffled[idx++])
    }
  }

  return card
}

/**
 * Find a client-side swap candidate: a prop from the pool with American odds
 * within ±25 of the original square, not already on the card, respecting conflict keys.
 *
 * @param {Object} originalSquare - the square being replaced (needs american_odds)
 * @param {Array}  fullPropPool   - output of matchOddsToRoster (the full matched pool)
 * @param {Array}  currentCardSquares - all 25 squares currently on the card
 * @returns {Object|null} a candidate prop (same shape as pool entry), or null
 */
export function findSwapCandidate(originalSquare, fullPropPool, currentCardSquares) {
  const candidates = findSwapCandidates(originalSquare, fullPropPool, currentCardSquares, 1)
  return candidates.length > 0 ? candidates[0] : null
}

/**
 * Find up to N swap candidates within ±25 American odds,
 * not conflicting with current card squares.
 *
 * @param {Object} originalSquare     - the square being replaced (needs american_odds)
 * @param {Array}  fullPropPool       - output of matchOddsToRoster (the full matched pool)
 * @param {Array}  currentCardSquares - all 25 squares currently on the card
 * @param {number} count              - max number of candidates to return (default 5)
 * @returns {Array} array of up to `count` candidate props
 */
export function findSwapCandidates(originalSquare, fullPropPool, currentCardSquares, count = 5) {
  if (!fullPropPool?.length) return []
  const origOdds = originalSquare?.american_odds
  if (origOdds == null) return []

  const usedConflictKeys = new Set()
  const usedDisplayTexts = new Set()
  for (const sq of currentCardSquares ?? []) {
    if (sq?.conflict_key) usedConflictKeys.add(sq.conflict_key)
    if (sq?.display_text) usedDisplayTexts.add(sq.display_text)
  }

  const eligible = fullPropPool.filter(
    (p) =>
      p.american_odds != null &&
      Math.abs(p.american_odds - origOdds) <= 25 &&
      !usedConflictKeys.has(p.conflict_key) &&
      !usedDisplayTexts.has(p.display_text) &&
      p.display_text !== originalSquare.display_text
  )

  const shuffled = eligible.slice().sort(() => Math.random() - 0.5)
  return shuffled.slice(0, count)
}
