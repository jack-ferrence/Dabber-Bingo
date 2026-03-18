# Dobber Design System — Arcade Scoreboard

## Philosophy
Retro arcade scoreboard. Deep navy-black backgrounds, burnt orange accent, monospace everything. Like an old LED scoreboard in a dimly lit arcade.

## Colors

### Backgrounds (dark → light)
- Page: `#0c0c14`
- Surface: `#12121e`
- Elevated: `#1a1a2e`
- Hover: `#22223a`
- Active / border: `#2a2a44`
- Marked square bg: `#2a1a10`

### Text (bright → dim)
- Bright: `#f0f0ff`
- Primary: `#e0e0f0`
- Secondary (subdued): `#c0c0d8`
- Muted: `#8888aa`
- Ghost: `#555577`
- Ultra-ghost: `#3a3a55`

### Accent
- Primary (orange): `#ff6b35`
- Primary light: `#ff8855`
- Primary dark: `#e05520`
- On primary (text on orange bg): `#0c0c14`

### Semantic
- Live (red — ONLY for live indicators): `#ff2d2d`
- Success (green): `#22c55e`
- Warning (amber): `#f59e0b`
- Info (blue): `#3b82f6`
- Purple: `#8b5cf6`

### Bingo square states
- Unmarked: bg `#1a1a2e`, border `#2a2a44`
- Unmarked hover: bg `#22223a`, border `#3a3a55`
- Marked: bg `#2a1a10`, border `#ff6b35`
- Free: bg `#ff6b35`, text `#0c0c14`
- Winning: pulsing orange `box-shadow` via `.sq-winning`

## Typography
- **Font**: JetBrains Mono (monospace) — the ONLY font in the entire app
- **Fallback stack**: `'JetBrains Mono', 'Fira Code', 'SF Mono', 'Cascadia Code', monospace`
- **Weights**: 400 (body), 600 (emphasis), 700 (labels/headings), 800–900 (display numbers, brand)
- **Labels**: `uppercase`, `letter-spacing: 0.08em–0.15em`
- **No serif, no sans-serif, no system-ui**

## Spacing & Sizing

| Element | Value |
|---|---|
| Page padding (mobile) | 16px |
| Page padding (desktop) | 20–24px |
| Card/panel padding | 12–16px |
| Section gap | 16px |
| Grid gap (bingo board) | 6px (`gap-1.5`) |
| List item vertical padding | 6px |
| Input padding | 8px 12px |
| Button padding (primary) | 8px 16px |
| Button padding (ghost/small) | 6px 12px |
| Border-radius (squares/small) | 3–4px |
| Border-radius (inputs/buttons) | 4px |
| Border-radius (cards/panels) | 6–8px |
| **Max border-radius** | **8px** |

## Interactive States

### Buttons — primary (orange)
- Default: bg `#ff6b35`, text `#0c0c14`
- Hover: bg `#ff8855`
- Active: `scale(0.97)` + bg `#e05520`
- Disabled: opacity `0.4`, cursor `not-allowed`

### Buttons — ghost/secondary
- Default: bg `transparent`, border `#2a2a44`, text `#8888aa`
- Hover: bg `#22223a`, border `#3a3a55`

### Inputs
- Default: border `#2a2a44`
- Hover: border `#3a3a55`
- Focus: border `#ff6b35`, `box-shadow: 0 0 0 2px rgba(255,107,53,0.15)`, `outline: none`

### Links
- Default: `#ff6b35`
- Hover: `#ff8855`
- No underlines anywhere

## CSS Custom Properties (dobber-brand.css)

All design tokens are available as CSS variables prefixed `--db-*`:

```css
/* Backgrounds */
--db-bg-page, --db-bg-surface, --db-bg-elevated, --db-bg-hover, --db-bg-active

/* Text */
--db-text-bright, --db-text-primary, --db-text-secondary, --db-text-muted, --db-text-ghost

/* Accent */
--db-primary, --db-primary-light, --db-primary-dark

/* Semantic */
--db-live, --db-success, --db-warn, --db-info, --db-danger

/* Typography */
--db-font-mono, --db-font-display, --db-font-body (all identical — JetBrains Mono)

/* Radius */
--db-radius-sm: 3px, --db-radius-md: 4px, --db-radius-lg: 8px

/* Transitions */
--db-duration-fast: 100ms, --db-duration-base: 200ms
--db-ease-smooth, --db-ease-bounce, --db-ease-snappy
```

## Utility Classes

```css
.db-btn-primary     /* orange primary button */
.db-btn-ghost       /* ghost/secondary button */
.db-card            /* surface card container */
.db-input           /* form input field */
.db-live-badge      /* red LIVE badge with pulse dot */
.db-lobby-badge     /* muted LOBBY badge */
.db-spinner         /* 16px orange loading spinner */
.db-heading         /* uppercase monospace heading */
.db-label           /* small uppercase section label */
.db-number          /* tabular-nums display number */
.db-transition      /* 200ms transition */
.db-transition-fast /* 100ms transition */
```

## Animations (globals.css)

```css
.sq-mark-in        /* scale pulse on square mark */
.sq-shine          /* shine sweep on newly-marked square */
.sq-winning        /* orange ring pulse on winning square */
.sq-line-flash     /* intense flash when line completes */
.sq-marked-glow    /* slow pulse glow on marked squares */
.sq-free-glow      /* shimmer on FREE center square */
.leaderboard-flash /* flash when player completes a line */
.rank-change       /* counter flip on rank change */
.badge-pop         /* scale-in for new badges */
.bingo-toast-enter /* toast slide down */
.bingo-toast-exit  /* toast slide up */
.chat-msg-in       /* chat message fade-slide */
.animate-in-from-top /* generic slide-down notification */
.machine-glow      /* subtle orange outer glow on the board */
```

## Rules

1. **Everything is monospace** — JetBrains Mono, no exceptions
2. **Only bright color is `#ff6b35`** — orange is the sole accent
3. **Red `#ff2d2d` is ONLY for live indicators** — never for errors (use orange for errors instead), never for decorative purposes
4. **Borders are subtle and thin** — 1px, low contrast
5. **Nothing is very rounded** — max 8px border-radius
6. **Dark mode only** — no light mode, no `@media (prefers-color-scheme: light)`
7. **No gradients on structural chrome** — team-color washes on game cards are acceptable as functional design
8. **No box-shadows except functional orange glows** — and dark elevation shadows
9. **No `#fff` / `#ffffff` except** text on the red `.db-live-badge`
