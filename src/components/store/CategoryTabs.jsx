export default function CategoryTabs({ tabs, activeTab, onTabChange }) {
  return (
    <div className="store-category-tabs" style={{ display: 'flex', gap: 4, marginBottom: 24, flexWrap: 'wrap' }}>
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onTabChange(t.key)}
          style={{
            background: activeTab === t.key ? '#ff6b35' : '#1a1a2e',
            color: activeTab === t.key ? '#0c0c14' : '#555577',
            border: `1px solid ${activeTab === t.key ? '#ff6b35' : '#2a2a44'}`,
            borderRadius: 4,
            fontFamily: 'var(--db-font-mono)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            padding: '5px 14px',
            cursor: 'pointer',
            transition: 'all 100ms ease',
          }}
          onMouseEnter={(e) => {
            if (activeTab !== t.key) {
              e.currentTarget.style.borderColor = '#3a3a55'
              e.currentTarget.style.color = '#8888aa'
            }
          }}
          onMouseLeave={(e) => {
            if (activeTab !== t.key) {
              e.currentTarget.style.borderColor = '#2a2a44'
              e.currentTarget.style.color = '#555577'
            }
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
