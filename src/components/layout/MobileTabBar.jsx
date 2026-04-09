import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth.jsx'

const TABS = [
  {
    path: '/',
    label: 'Home',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M3 10l7-7 7 7" stroke={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 8.5V16a1 1 0 001 1h3v-4h2v4h3a1 1 0 001-1V8.5" stroke={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    path: '/games',
    label: 'Games',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="5" width="16" height="11" rx="2" stroke={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} strokeWidth="1.5" />
        <circle cx="6.5" cy="10.5" r="1.5" fill={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} />
        <circle cx="10" cy="10.5" r="1.5" fill={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} />
        <circle cx="13.5" cy="10.5" r="1.5" fill={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} />
        <path d="M6 5V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v1" stroke={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    path: '/rank',
    label: 'Rank',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <path d="M10 2l2.5 5.5H18l-4.5 3.5 1.5 6L10 14l-5 3 1.5-6L2 7.5h5.5L10 2z" stroke={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} strokeWidth="1.5" strokeLinejoin="round" fill={active ? 'rgba(255,107,53,0.15)' : 'none'} />
      </svg>
    ),
  },
  {
    path: '/settings',
    label: 'Profile',
    icon: (active) => (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="7" r="3" stroke={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} strokeWidth="1.5" />
        <path d="M3 17c0-3.314 3.134-6 7-6s7 2.686 7 6" stroke={active ? 'var(--db-primary)' : 'var(--db-text-ghost)'} strokeWidth="1.5" strokeLinecap="round" />
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
      role="navigation"
      aria-label="Main navigation"
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
        alignItems: 'stretch',
      }}
    >
      {TABS.map((tab) => {
        const isActive = location.pathname === tab.path
        const isBouncing = bouncingTab === tab.path
        return (
          <Link
            key={tab.path}
            to={tab.path}
            aria-label={tab.label}
            aria-current={isActive ? 'page' : undefined}
            onMouseDown={() => handleTap(tab.path)}
            onTouchStart={() => handleTap(tab.path)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '8px 12px',
              textDecoration: 'none',
              minHeight: 44,
              minWidth: 60,
              justifyContent: 'center',
              position: 'relative',
              outline: 'none',
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
                background: 'var(--db-primary)',
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
              fontSize: 'var(--db-text-2xs)',
              fontWeight: isActive ? 'var(--db-weight-bold)' : 'var(--db-weight-medium)',
              letterSpacing: 'var(--db-tracking-normal)',
              color: isActive ? 'var(--db-primary)' : 'var(--db-text-muted)',
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
