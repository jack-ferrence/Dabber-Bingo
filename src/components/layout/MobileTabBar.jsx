import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'

const TABS = [
  { path: '/',         label: 'Games',    icon: '🏀' },
  { path: '/store',    label: 'Store',    icon: '◈'  },
  { path: '/settings', label: 'Settings', icon: '⚙'  },
]

export default function MobileTabBar() {
  const location = useLocation()
  const { user } = useAuth()

  if (!user) return null
  if (location.pathname.startsWith('/room/')) return null

  return (
    <nav
      className="md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: '#12121e',
        borderTop: '1px solid #2a2a44',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
      }}
    >
      {TABS.map((tab) => {
        const isActive = location.pathname === tab.path
        return (
          <Link
            key={tab.path}
            to={tab.path}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              padding: '8px 16px',
              textDecoration: 'none',
              color: isActive ? '#ff6b35' : '#555577',
              minHeight: 44,
              minWidth: 44,
              justifyContent: 'center',
              transition: 'color 100ms ease',
            }}
          >
            <span style={{ fontSize: 20, lineHeight: 1 }}>{tab.icon}</span>
            <span style={{
              fontFamily: 'var(--db-font-mono)',
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
