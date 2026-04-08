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
      </defs>
      <circle cx="256" cy="256" r="240" fill="url(#db-ball)"/>
      <circle cx="256" cy="256" r="142" fill="none" stroke="url(#db-ring)" strokeWidth="20"/>
      <text x="256" y="256" textAnchor="middle" fontFamily="'Bebas Neue','Oswald',sans-serif" fontSize="182" fontWeight="400" fill="#1a1a2e" dominantBaseline="central">D</text>
    </svg>
  )
}
