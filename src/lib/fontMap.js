export const FONT_MAP = {
  default: "'JetBrains Mono', monospace",
  mono:    "'JetBrains Mono', monospace",
  display: "'Outfit', sans-serif",
  serif:   "Georgia, 'Times New Roman', serif",
  rounded: "'Nunito', 'Varela Round', sans-serif",
}

export function getFontFamily(fontKey) {
  return FONT_MAP[fontKey] || FONT_MAP.default
}

// Badge metadata keyed by item_id — avoids extra DB queries in Leaderboard/Chat
export const BADGE_MAP = {
  badge_flame:     { emoji: '🔥', label: 'ON FIRE' },
  badge_crown:     { emoji: '👑', label: 'CHAMP' },
  badge_lightning: { emoji: '⚡', label: 'FAST' },
  badge_diamond:   { emoji: '💎', label: 'DIAMOND' },
  badge_ghost:     { emoji: '👻', label: 'GHOST' },
  badge_rocket:    { emoji: '🚀', label: 'LAUNCH' },
  badge_skull:     { emoji: '💀', label: 'SKULL' },
  badge_star:      { emoji: '⭐', label: 'ALL-STAR' },
  // Legacy badge IDs from v1
  badge_fire:  { emoji: '🔥', label: 'ON FIRE' },
  badge_goat:  { emoji: '🐐', label: 'GOAT' },
  badge_zap:   { emoji: '⚡', label: 'ZAP' },
  badge_gem:   { emoji: '💎', label: 'GEM' },
  // v3 badges
  badge_100:   { emoji: '💯', label: '100' },
  badge_money: { emoji: '💰', label: 'MONEY' },
  badge_eyes:  { emoji: '👀', label: 'EYES' },
  badge_goat2: { emoji: '🐐', label: 'GOAT' },
  badge_ice:   { emoji: '🧊', label: 'ICE' },
  badge_alien: { emoji: '👽', label: 'ALIEN' },
  badge_clown:     { emoji: '🤡', label: 'CLOWN' },
  badge_supporter: { emoji: '🎱', label: 'SUPPORTER' },
}

export function getBadge(itemId) {
  return BADGE_MAP[itemId] ?? null
}

export const EMOTE_MAP = {
  'emote_dab':    { code: ':dab:',   emoji: '🫳' },
  'emote_bingo':  { code: ':bingo:', emoji: '🎯' },
  'emote_sweat':  { code: ':sweat:', emoji: '😰' },
  'emote_gg':     { code: ':gg:',    emoji: '🤝' },
  'emote_copium': { code: ':cope:',  emoji: '🫠' },
  'emote_nuke':   { code: ':nuke:',  emoji: '☢️' },
}
// code → emoji lookup for rendering
export const EMOTE_CODE_MAP = Object.fromEntries(
  Object.values(EMOTE_MAP).map(({ code, emoji }) => [code, emoji])
)
export function getEmote(itemId) {
  return EMOTE_MAP[itemId] ?? null
}
