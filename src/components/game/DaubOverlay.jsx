/**
 * DaubOverlay
 * Absolutely-positioned overlay rendered on marked BingoSquares.
 * Classic style returns null (keeps existing ✓ checkmark behaviour).
 * Each other style is a lightweight SVG that scales to the square.
 */

// ── Sub-components ────────────────────────────────────────────────────────────

function StampDaub({ animated }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0 }}
      className={animated ? 'daub-anim-stamp' : ''}
    >
      <circle cx="50" cy="50" r="32" stroke="#ff6b35" strokeWidth="3" fill="rgba(255,107,53,0.12)" opacity="0.85" />
      <text
        x="50" y="57"
        textAnchor="middle"
        fontSize="22"
        fontWeight="800"
        fill="#ff6b35"
        opacity="0.7"
        fontFamily="monospace"
      >
        ✓
      </text>
    </svg>
  )
}

function XDaub({ animated }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0 }}
      className={animated ? 'daub-anim-x' : ''}
    >
      <line x1="18" y1="18" x2="82" y2="82" stroke="#ff6b35" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
      <line x1="82" y1="18" x2="18" y2="82" stroke="#ff6b35" strokeWidth="3" strokeLinecap="round" opacity="0.65" />
    </svg>
  )
}

function StarDaub({ animated }) {
  // 5-pointed star: outer r=35, inner r=14, center (50,50)
  const pts = [
    [50, 15],        [58.23, 38.67], [83.28, 39.19],
    [63.31, 54.33],  [70.58, 78.32], [50, 64],
    [29.42, 78.32],  [36.69, 54.33], [16.72, 39.19],
    [41.77, 38.67],
  ].map((p) => p.join(',')).join(' ')

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0 }}
      className={animated ? 'daub-anim-star' : ''}
    >
      <polygon points={pts} fill="#f59e0b" opacity="0.5" />
    </svg>
  )
}

function SplatterDaub({ animated }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0 }}
      className={animated ? 'daub-anim-splatter' : ''}
    >
      <ellipse cx="50" cy="50" rx="28" ry="22" fill="rgba(255,107,53,0.25)" />
      <ellipse cx="62" cy="42" rx="18" ry="14" fill="rgba(255,107,53,0.20)" />
      <ellipse cx="38" cy="60" rx="14" ry="10" fill="rgba(255,107,53,0.35)" />
      <ellipse cx="66" cy="63" rx="9"  ry="7"  fill="rgba(255,107,53,0.18)" />
      <ellipse cx="33" cy="38" rx="7"  ry="9"  fill="rgba(255,107,53,0.22)" />
    </svg>
  )
}

function FireDaub({ animated }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0 }}
      className={animated ? 'daub-anim-fire' : ''}
    >
      <defs>
        <linearGradient id="fire-grad" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%"  stopColor="#ff6b35" stopOpacity="0.45" />
          <stop offset="45%" stopColor="#ff4400" stopOpacity="0.18" />
          <stop offset="75%" stopColor="#ff6b35" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* Background gradient wash */}
      <rect x="0" y="0" width="100" height="100" fill="url(#fire-grad)" />
      {/* Three flame tongues */}
      <path
        d="M 50 98 C 34 88 24 72 28 56 C 32 44 42 48 50 38 C 58 48 68 44 72 56 C 76 72 66 88 50 98 Z"
        fill="#ff6b35"
        opacity="0.35"
        className="daub-fire-flicker"
      />
      <path
        d="M 38 98 C 26 86 22 70 28 60 C 32 52 38 56 38 48 C 42 58 36 70 40 82 C 41 87 39 93 38 98 Z"
        fill="#ff6b35"
        opacity="0.25"
        className="daub-fire-flicker"
        style={{ animationDelay: '0.3s' }}
      />
      <path
        d="M 62 98 C 74 86 78 70 72 60 C 68 52 62 56 62 48 C 58 58 64 70 60 82 C 59 87 61 93 62 98 Z"
        fill="#ff6b35"
        opacity="0.25"
        className="daub-fire-flicker"
        style={{ animationDelay: '0.6s' }}
      />
    </svg>
  )
}

function LightningDaub({ animated }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{
        position: 'absolute', inset: 0,
        filter: 'drop-shadow(0 0 3px rgba(139,92,246,0.5))',
      }}
      className={animated ? 'daub-anim-lightning' : ''}
    >
      {/* Jagged lightning bolt diagonally across the square */}
      <polyline
        points="70,10 45,45 58,45 30,90"
        stroke="#ff6b35"
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
        opacity="0.75"
      />
    </svg>
  )
}

function FingerprintDaub({ animated }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0 }}
      className={animated ? 'daub-anim-fp' : ''}
    >
      {/* Concentric arcs with dasharray to suggest fingerprint ridges */}
      <circle cx="54" cy="54" r="30" stroke="#ff6b35" strokeWidth="1.5" fill="none" strokeDasharray="58 25"  opacity="0.4" transform="rotate(-20 54 54)" />
      <circle cx="54" cy="54" r="22" stroke="#ff6b35" strokeWidth="1.2" fill="none" strokeDasharray="46 18"  opacity="0.4" transform="rotate(-15 54 54)" />
      <circle cx="54" cy="54" r="14" stroke="#ff6b35" strokeWidth="1"   fill="none" strokeDasharray="34 12"  opacity="0.4" transform="rotate(-10 54 54)" />
      <circle cx="54" cy="54" r="7"  stroke="#ff6b35" strokeWidth="1"   fill="none" strokeDasharray="18 8"   opacity="0.4" />
    </svg>
  )
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DaubOverlay({ style = 'classic', size = 100, animated = true }) {
  if (style === 'classic') return null

  return (
    <div style={{
      position: 'absolute', inset: 0,
      pointerEvents: 'none',
      overflow: 'hidden',
    }}>
      {style === 'stamp'       && <StampDaub animated={animated} />}
      {style === 'x'           && <XDaub animated={animated} />}
      {style === 'star'        && <StarDaub animated={animated} />}
      {style === 'splatter'    && <SplatterDaub animated={animated} />}
      {style === 'fire'        && <FireDaub animated={animated} />}
      {style === 'lightning'   && <LightningDaub animated={animated} />}
      {style === 'fingerprint' && <FingerprintDaub animated={animated} />}
    </div>
  )
}
