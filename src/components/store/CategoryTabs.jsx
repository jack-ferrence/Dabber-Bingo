export default function CategoryTabs({ tabs, activeTab, onTabChange }) {
  return (
    <div
      style={{ display: 'flex', gap: 0, marginBottom: 24, borderBottom: '1px solid rgba(255,255,255,0.05)', flexWrap: 'nowrap', overflowX: 'auto' }}
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
              color: isActive ? '#e8e8f4' : 'rgba(255,255,255,0.35)',
              fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: isActive ? 600 : 500,
              letterSpacing: '0.04em', background: 'none', border: 'none',
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'color 120ms ease',
            }}
            onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.6)' }}
            onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'rgba(255,255,255,0.35)' }}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
