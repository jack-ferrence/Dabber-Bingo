/**
 * Seeded PRNG using the current date so all players get the same
 * randomised game each day. Uses a simple mulberry32 algorithm.
 */

function mulberry32(seed) {
  return function () {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}

/**
 * Creates a seeded random number generator for today's date.
 * Optionally pass a game name for per-game variation.
 *
 * @param {string} [gameName] - e.g. 'derby', 'passer', 'flick'
 * @returns {{ next: () => number, range: (min: number, max: number) => number, int: (min: number, max: number) => number, pick: (arr: any[]) => any, shuffle: (arr: any[]) => any[] }}
 */
export function createDailySeed(gameName = '') {
  const today = new Date().toISOString().slice(0, 10) // "2026-04-09"
  const seed = hashString(today + ':' + gameName)
  const rng = mulberry32(seed)

  return {
    /** Returns a float in [0, 1) */
    next: rng,

    /** Returns a float in [min, max) */
    range(min, max) {
      return min + rng() * (max - min)
    },

    /** Returns an integer in [min, max] inclusive */
    int(min, max) {
      return Math.floor(min + rng() * (max - min + 1))
    },

    /** Picks a random element from an array */
    pick(arr) {
      return arr[Math.floor(rng() * arr.length)]
    },

    /** Returns a shuffled copy of the array */
    shuffle(arr) {
      const copy = [...arr]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1))
        ;[copy[i], copy[j]] = [copy[j], copy[i]]
      }
      return copy
    },
  }
}
