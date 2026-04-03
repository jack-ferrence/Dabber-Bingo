/**
 * NBA team primary brand colors keyed by abbreviation.
 * Used by GameCard for top-border accent and hover glow.
 */
export const NBA_TEAM_COLORS = {
  ATL: '#E03A3E', // Hawks
  BOS: '#007A33', // Celtics
  BKN: '#AAAAAA', // Nets (white on dark bg → light gray)
  BK:  '#AAAAAA', // Nets (ESPN alt)
  CHA: '#1D1160', // Hornets
  CHO: '#1D1160', // Hornets (ESPN alt)
  CHI: '#CE1141', // Bulls
  CLE: '#860038', // Cavaliers
  DAL: '#00538C', // Mavericks
  DEN: '#FEC524', // Nuggets gold
  DET: '#C8102E', // Pistons
  GS:  '#1D428A', // Warriors (ESPN uses GS)
  GSW: '#1D428A', // Warriors
  HOU: '#CE1141', // Rockets
  IND: '#FDBB30', // Pacers gold
  LAC: '#C8102E', // Clippers
  LAL: '#552583', // Lakers
  MEM: '#5D76A9', // Grizzlies
  MIA: '#98002E', // Heat
  MIL: '#00471B', // Bucks
  MIN: '#0C2340', // Timberwolves
  NO:  '#0C2340', // Pelicans (ESPN uses NO)
  NOP: '#0C2340', // Pelicans
  NY:  '#F58426', // Knicks (ESPN uses NY)
  NYK: '#F58426', // Knicks
  OKC: '#007AC1', // Thunder
  ORL: '#0077C0', // Magic
  PHI: '#006BB6', // 76ers
  PHX: '#E56020', // Suns orange
  PHO: '#E56020', // Suns (ESPN alt)
  POR: '#E03A3E', // Trail Blazers
  SAC: '#5A2D81', // Kings
  SA:  '#C4CED4', // Spurs (ESPN uses SA)
  SAS: '#C4CED4', // Spurs
  TOR: '#CE1141', // Raptors
  UTA: '#002B5C', // Jazz
  UTAH:'#002B5C', // Jazz (ESPN alt)
  WAS: '#002B5C', // Wizards
  WSH: '#002B5C', // Wizards (ESPN alt)
  DEFAULT: '#475569',
}

export const MLB_TEAM_COLORS = {
  ARI: '#A71930', // Diamondbacks
  ATL: '#CE1141', // Braves
  BAL: '#DF4601', // Orioles
  BOS: '#BD3039', // Red Sox
  CHC: '#0E3386', // Cubs
  CWS: '#C4CED4', // White Sox silver
  CIN: '#C6011F', // Reds
  CLE: '#00385D', // Guardians
  COL: '#333366', // Rockies
  DET: '#0C2340', // Tigers
  HOU: '#002D62', // Astros
  KC:  '#004687', // Royals
  LAA: '#BA0021', // Angels
  LAD: '#005A9C', // Dodgers
  MIA: '#00A3E0', // Marlins
  MIL: '#FFC52F', // Brewers
  MIN: '#002B5C', // Twins
  NYM: '#002D72', // Mets
  NYY: '#003087', // Yankees
  OAK: '#003831', // Athletics
  PHI: '#E81828', // Phillies
  PIT: '#FDB827', // Pirates
  SD:  '#2F241D', // Padres
  SF:  '#FD5A1E', // Giants
  SEA: '#0C2C56', // Mariners
  STL: '#C41E3A', // Cardinals
  TB:  '#092C5C', // Rays
  TEX: '#003278', // Rangers
  TOR: '#134A8E', // Blue Jays
  WSH: '#AB0003', // Nationals
  DEFAULT: '#475569',
}

export const NCAA_TEAM_COLORS = {
  TEX:  '#BF5700', // Texas
  PUR:  '#CEB888', // Purdue
  IOWA: '#FFCD00', // Iowa
  NEB:  '#E41C38', // Nebraska
  ARK:  '#9D2235', // Arkansas
  ARIZ: '#CC0033', // Arizona
  ILL:  '#E84A27', // Illinois
  HOU:  '#C8102E', // Houston
  DUKE: '#003087', // Duke
  SJU:  '#BA0C2F', // St John's
  ALA:  '#9E1B32', // Alabama
  MICH: '#00274C', // Michigan
  MSU:  '#18453B', // Michigan State
  CONN: '#000E2F', // UConn
  TENN: '#FF8200', // Tennessee
  ISU:  '#C8102E', // Iowa State
  DEFAULT: '#475569',
}

/**
 * Convert a hex color to rgba string.
 * Used to build semi-transparent glow values.
 */
export function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
