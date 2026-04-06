export default function CategoryTabs({ tabs, activeTab, onTabChange }) {
  return (
    <div
      style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid var(--db-border-subtle)', flexWrap: 'nowrap', overflowX: 'auto' }}
      className="no-scrollbar"
    >
      {tabs.map((t) => {
        const isActive = activeTab === t.key
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            style={{
              padding: '6px 0 10px', marginRight: 20,
              borderBottom: isActive ? '2px solid #ff6b35' : '2px solid transparent',
              borderBottomStyle: 'solid', borderBottomWidth: 2,
              borderBottomColor: isActive ? '#ff6b35' : 'transparent',
              color: isActive ? 'var(--db-text-primary)' : 'var(--db-text-ghost)',
              fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: isActive ? 600 : 500,
              letterSpacing: '0.04em', background: 'none', border: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'color 120ms ease',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--db-text-secondary)' }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--db-text-ghost)' }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
