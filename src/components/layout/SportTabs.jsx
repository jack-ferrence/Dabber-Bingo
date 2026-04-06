const SPORTS = [
  { key: 'nba',    label: 'NBA',    active: true },
  { key: 'ncaa',   label: 'NCAA',   active: true },
  { key: 'nhl',    label: 'NHL',    active: false },
  { key: 'nfl',    label: 'NFL',    active: false },
  { key: 'soccer', label: 'Soccer', active: false },
]

export default function SportTabs({ onTabClick }) {
  const handleClick = (sport) => {
    if (!sport.active) return
    if (onTabClick) {
      onTabClick(sport.key)
    } else {
      const el = document.getElementById(`sport-section-${sport.key}`)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  return (
    <div
      className="flex items-center overflow-x-auto"
      style={{ borderBottom: '1px solid var(--db-border-subtle)', scrollbarWidth: 'none' }}
    >
      {SPORTS.map((sport) => (
        <button
          key={sport.key}
          type="button"
          disabled={!sport.active}
          onClick={() => handleClick(sport)}
          style={{
            fontFamily: 'var(--db-font-ui)',
            fontSize: 12,
            fontWeight: 600,
            padding: '8px 16px',
            cursor: sport.active ? 'pointer' : 'default',
            color: sport.active ? '#ff6b35' : 'var(--db-text-ghost)',
            background: 'none',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            borderBottom: sport.active ? '2px solid #ff6b35' : '2px solid transparent',
            flexShrink: 0,
            transition: 'color 100ms ease',
            outline: 'none',
          }}
          onMouseEnter={(e) => { if (sport.active) e.currentTarget.style.color = '#ff8855' }}
          onMouseLeave={(e) => { if (sport.active) e.currentTarget.style.color = '#ff6b35' }}
        >
          {sport.label}
          {!sport.active && (
            <span style={{ marginLeft: 6, fontSize: 8, fontFamily: 'var(--db-font-display)', color: 'var(--db-text-ghost)', letterSpacing: '0.06em' }}>
              SOON
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
