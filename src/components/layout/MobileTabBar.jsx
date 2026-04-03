import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'

const TABS = [
  {
    path: '/',
    label: 'Games',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="5" width="16" height="11" rx="2" stroke={active ? '#ff6b35' : 'var(--db-text-ghost)'} strokeWidth="1.5" />
        <circle cx="6.5" cy="10.5" r="1.5" fill={active ? '#ff6b35' : 'var(--db-text-ghost)'} />
        <circle cx="10" cy="10.5" r="1.5" fill={active ? '#ff6b35' : 'var(--db-text-ghost)'} />
        <circle cx="13.5" cy="10.5" r="1.5" fill={active ? '#ff6b35' : 'var(--db-text-ghost)'} />
        <path d="M6 5V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" stroke={active ? '#ff6b35' : 'var(--db-text-ghost)'} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    path: '/store',
    label: 'Store',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 5h14l-1.5 8H4.5L3 5Z" stroke={active ? '#ff6b35' : 'var(--db-text-ghost)'} strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M3 5l-.8-2H1" stroke={active ? '#ff6b35' : 'var(--db-text-ghost)'} strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="7" cy="16.5" r="1" fill={active ? '#ff6b35' : 'var(--db-text-ghost)'} />
        <circle cx="13" cy="16.5" r="1" fill={active ? '#ff6b35' : 'var(--db-text-ghost)'} />
        <path d="M7.5 9l1.5 2 3-3" stroke={active ? '#ff6b35' : 'var(--db-text-ghost)'} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    path: '/settings',
    label: 'Profile',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="3" stroke={active ? '#ff6b35' : 'var(--db-text-ghost)'} strokeWidth="1.5" />
        <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke={active ? '#ff6b35' : 'var(--db-text-ghost)'} strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
]

export default function MobileTabBar() {
  const location = useLocation()
  const { user } = useAuth()
  const [bouncingTab, setBouncingTab] = useState(null)

  if (!user) return null
  if (location.pathname.startsWith('/room/')) return null

  function handleTap(path) {
    setBouncingTab(path)
    setTimeout(() => setBouncingTab(null), 300)
  }

  return (
    <nav
      className="md:hidden"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        background: 'var(--db-bg-overlay)',
        borderTop: '1px solid var(--db-border-subtle)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        height: 56,
      }}
    >
      {TABS.map((tab) => {
        const isActive = location.pathname === tab.path
        const isBouncing = bouncingTab === tab.path
        return (
          <Link
            key={tab.path}
            to={tab.path}
            onMouseDown={() => handleTap(tab.path)}
            onTouchStart={() => handleTap(tab.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '8px 20px',
              textDecoration: 'none',
              minHeight: 44,
              minWidth: 60,
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            {/* Active indicator bar */}
            {isActive && (
              <span style={{
                position: 'absolute',
                top: 0,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 32,
                height: 2,
                background: '#ff6b35',
                borderRadius: '0 0 2px 2px',
                boxShadow: '0 0 8px rgba(255,107,53,0.6)',
              }} />
            )}
            {/* Icon with bounce — key forces animation restart */}
            <span
              key={isBouncing ? `${tab.path}-b` : tab.path}
              className={isBouncing ? 'tab-icon-bounce' : ''}
              style={{ display: 'inline-flex' }}
            >
              {tab.icon(isActive)}
            </span>
            <span style={{
              fontFamily: 'var(--db-font-ui)',
              fontSize: 9.5,
              fontWeight: isActive ? 700 : 500,
              letterSpacing: '0.03em',
              color: isActive ? '#ff6b35' : 'var(--db-text-ghost)',
              transition: 'color 120ms ease',
            }}>
              {tab.label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
