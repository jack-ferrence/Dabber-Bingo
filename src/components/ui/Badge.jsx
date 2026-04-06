const VARIANTS = {
  success: { background: 'rgba(34,197,94,0.12)',  color: '#22c55e', border: '1px solid rgba(34,197,94,0.25)' },
  warning: { background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' },
  danger:  { background: 'rgba(255,45,45,0.12)',  color: '#ff2d2d', border: '1px solid rgba(255,45,45,0.25)' },
  muted:   { background: 'var(--db-bg-elevated)', color: 'var(--db-text-ghost)', border: '1px solid var(--db-border-default)' },
}

function Badge({ variant = 'muted', pulse = false, pop = false, className = '', children }) {
  const vs = VARIANTS[variant] ?? VARIANTS.muted
  return (
    <span
      className={`inline-flex items-center gap-1 ${pop ? 'badge-pop' : ''} ${className}`}
      style={{
        ...vs,
        borderRadius: 4,
        padding: '2px 8px',
        fontFamily: 'var(--db-font-mono)',
        fontSize: 9,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
      }}
    >
      {pulse && (
        <span
          style={{
            display: 'inline-block',
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: 'currentColor',
            animation: 'db-pulse 1.5s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}

export default Badge
