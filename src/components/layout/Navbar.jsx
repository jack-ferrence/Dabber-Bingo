import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.js'
import DobberLogo from '../ui/DobberLogo.jsx'

export default function Navbar({ onMenuClick }) {
  const { user, loading } = useAuth()
  const { dobsBalance, username: profileUsername } = useProfile()
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const location = useLocation()
  const isStore = location.pathname === '/store'

  const initial = (profileUsername ?? (user?.is_anonymous ? 'G' : user?.email))?.[0]?.toUpperCase() ?? 'U'
  const displayName = profileUsername ?? (user?.is_anonymous ? `Guest_${user?.id?.slice(0, 6)}` : user?.email)

  return (
    <header
      className="flex-shrink-0 z-50"
      style={{
        background: 'var(--db-bg-overlay)',
        borderBottom: '1px solid var(--db-border-subtle)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      <div className="flex h-12 items-center justify-between px-4">

        {/* Left: wordmark */}
        <Link
          to="/"
          style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}
        >
          <DobberLogo size={22} />
          <span
            className="navbar-wordmark"
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 22,
              letterSpacing: '5px',
              color: 'var(--db-text-primary)',
              lineHeight: 1,
              paddingTop: 2,
            }}
          >
            DOBBER
          </span>
        </Link>

        {/* Right: user area */}
        {loading ? null : user ? (
          <div className="flex items-center gap-2.5">

            {/* Dobs balance */}
            {dobsBalance !== null && (
              <>
                {/* Mobile: compact */}
                <Link
                  to="/store"
                  title="Open Dobs Store"
                  className="flex items-center md:hidden"
                  style={{ gap: 4, textDecoration: 'none' }}
                >
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 800, color: '#ff6b35', letterSpacing: '0.03em' }}>
                    {dobsBalance.toLocaleString()} ◈
                  </span>
                </Link>

                {/* Desktop: pill chip */}
                <Link
                  to="/store"
                  title="Open Dobs Store"
                  className="hidden md:flex items-center"
                  style={{
                    background: 'rgba(255,107,53,0.08)',
                    border: '1px solid rgba(255,107,53,0.2)',
                    borderRadius: 20,
                    padding: '4px 12px 4px 8px',
                    gap: 6,
                    textDecoration: 'none',
                    transition: 'background 140ms ease, border-color 140ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.14)'; e.currentTarget.style.borderColor = 'rgba(255,107,53,0.35)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,107,53,0.2)' }}
                >
                  <span style={{ color: '#ff6b35', fontSize: 12, lineHeight: 1 }}>◆</span>
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 800, color: '#ff6b35', letterSpacing: '0.02em' }}>
                    {dobsBalance.toLocaleString()}
                  </span>
                  <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 10, fontWeight: 600, color: 'rgba(255,107,53,0.55)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                    Dobs
                  </span>
                </Link>
              </>
            )}

            {/* Store link — desktop */}
            <Link
              to="/store"
              className="hidden md:flex items-center"
              style={{
                fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600,
                letterSpacing: '0.02em', textDecoration: 'none',
                color: isStore ? '#ff6b35' : 'var(--db-text-ghost)',
                gap: 4,
                transition: 'color 120ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = isStore ? '#ff6b35' : 'var(--db-text-ghost)' }}
            >
              Store
            </Link>

            {/* Avatar + dropdown — desktop */}
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{
                    background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                    color: '#fff',
                    borderRadius: 4,
                    fontFamily: 'var(--db-font-ui)',
                    fontWeight: 800,
                    fontSize: 11,
                    letterSpacing: 0,
                    boxShadow: '0 2px 8px rgba(255,107,53,0.4)',
                  }}
                >
                  {initial}
                </span>
                <span
                  className="hidden sm:block max-w-[120px] truncate"
                  style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-text-muted)' }}
                >
                  {displayName}
                </span>
                <span style={{ color: 'var(--db-text-muted)', fontSize: 10 }}>▾</span>
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div
                    className="absolute right-0 top-10 z-20 w-44 py-1.5 animate-in-from-top"
                    style={{
                      background: 'var(--db-bg-elevated)',
                      border: '1px solid var(--db-border-default)',
                      borderRadius: 8,
                      boxShadow: 'var(--db-shadow-lg)',
                    }}
                  >
                    <div style={{ padding: '6px 12px 8px', borderBottom: '1px solid var(--db-border-subtle)', marginBottom: 4 }}>
                      <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 600, color: 'var(--db-text-primary)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {displayName}
                      </p>
                    </div>
                    <Link
                      to="/settings"
                      onClick={() => setDropdownOpen(false)}
                      className="block w-full px-3 py-2 text-left"
                      style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-text-secondary)', textDecoration: 'none', display: 'block', borderRadius: 4, margin: '0 4px', width: 'calc(100% - 8px)', transition: 'background 100ms, color 100ms' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-border-subtle)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--db-text-secondary)' }}
                    >
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => { supabase.auth.signOut(); setDropdownOpen(false) }}
                      className="w-full px-3 py-2 text-left"
                      style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 500, color: 'var(--db-text-secondary)', background: 'none', border: 'none', cursor: 'pointer', display: 'block', borderRadius: 4, margin: '0 4px', width: 'calc(100% - 8px)', transition: 'background 100ms, color 100ms' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-border-subtle)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--db-text-secondary)' }}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <Link
              to="/login"
              style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--db-text-muted)', textDecoration: 'none', transition: 'color 120ms' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-primary)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-muted)' }}
            >
              Log in
            </Link>
            <Link
              to="/register"
              style={{
                fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 700,
                color: '#fff', background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                borderRadius: 6, padding: '6px 14px',
                textDecoration: 'none', letterSpacing: '0.01em',
                boxShadow: '0 2px 8px rgba(255,107,53,0.3)',
                transition: 'opacity 120ms ease',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
