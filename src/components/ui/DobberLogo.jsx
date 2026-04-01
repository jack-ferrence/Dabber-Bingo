export default function DobberLogo({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" style={{ display: 'block', flexShrink: 0 }}>
      <defs>
        <linearGradient id="db-ball" x1="0.3" y1="0.1" x2="0.7" y2="0.9">
          <stop offset="0%" stopColor="#f2efe9"/>
          <stop offset="100%" stopColor="#c8c5bf"/>
        </linearGradient>
        <linearGradient id="db-ring" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffaa44"/>
          <stop offset="50%" stopColor="#ff6b35"/>
          <stop offset="100%" stopColor="#b8400e"/>
        </linearGradient>
        <clipPath id="db-rr"><rect width="512" height="512" rx="114"/></clipPath>
      </defs>
      <g clipPath="url(#db-rr)">
        <rect width="512" height="512" fill="#ff6b35"/>
        <circle cx="280" cy="280" r="165" fill="#0c0c14" opacity="0.18"/>
        <circle cx="250" cy="250" r="165" fill="url(#db-ball)"/>
        <circle cx="250" cy="250" r="97" fill="none" stroke="url(#db-ring)" strokeWidth="15"/>
        <text x="250" y="250" textAnchor="middle" fontFamily="'Outfit',sans-serif" fontSize="124" fontWeight="900" fill="#1a1a2e" dominantBaseline="central">D</text>
      </g>
    </svg>
  )
}
