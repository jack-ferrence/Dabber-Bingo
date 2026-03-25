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

  return (
    <header
      className="flex-shrink-0 z-50"
      style={{ background: '#0c0c14', borderBottom: '1px solid #1a1a2e' }}
    >
      {/* Top row */}
      <div className="flex h-12 items-center justify-between px-4">

        {/* Left: logo (hamburger hidden on mobile — bottom tab bar replaces it) */}
        <div className="flex items-center gap-3">
          <Link
            to="/"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          >
            <DobberLogo size={26} />
            <span className="navbar-wordmark" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 800, letterSpacing: '4px', color: '#e0e0f0', lineHeight: 1 }}>
              DOBBER
            </span>
          </Link>
        </div>

        {/* Right: user area */}
        {loading ? null : user ? (
          <div className="flex items-center gap-3">

            {/* Dobs balance — visible on mobile (tapping goes to store) */}
            {dobsBalance !== null && (
              <>
                {/* Mobile: compact balance pill */}
                <Link
                  to="/store"
                  title="Open Dobs Store"
                  className="flex items-center md:hidden"
                  style={{
                    gap: 4,
                    textDecoration: 'none',
                  }}
                >
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, fontWeight: 800, color: '#ff6b35', letterSpacing: '0.04em' }}>
                    {dobsBalance.toLocaleString()} ◈
                  </span>
                </Link>
                {/* Desktop: full balance badge */}
                <Link
                  to="/store"
                  title="Open Dobs Store"
                  className="hidden md:flex items-center"
                  style={{
                    background: '#1a1a2e',
                    border: '1px solid #2a2a44',
                    borderRadius: 4,
                    padding: '4px 10px',
                    gap: 4,
                    textDecoration: 'none',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 12px rgba(255,107,53,0.2)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '' }}
                >
                  <span style={{ color: '#ff6b35', fontSize: 10, marginRight: 4 }}>◆</span>
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 800, color: '#ff6b35' }}>
                    {dobsBalance.toLocaleString()}
                  </span>
                  <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', marginLeft: 3 }}>
                    DOBS
                  </span>
                </Link>
              </>
            )}

            {/* Store link — desktop only */}
            <Link
              to="/store"
              className="hidden md:flex"
              style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none',
                color: isStore ? '#ff6b35' : '#555577',
                alignItems: 'center', gap: 4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b35' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = isStore ? '#ff6b35' : '#555577' }}
            >
              <span style={{ fontSize: 13 }}>◈</span>
              STORE
            </Link>

            {/* User button + dropdown — desktop only */}
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setDropdownOpen((v) => !v)}
                className="flex items-center gap-2"
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
              >
                <span
                  className="flex h-7 w-7 items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: '#ff6b35', color: '#0c0c14', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontWeight: 800 }}
                >
                  {(profileUsername ?? (user.is_anonymous ? 'G' : user.email))?.[0]?.toUpperCase() ?? 'U'}
                </span>
                <span
                  className="hidden sm:block max-w-[160px] truncate"
                  style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577' }}
                >
                  {profileUsername ?? (user.is_anonymous ? `Guest_${user.id.slice(0, 6)}` : user.email)}
                </span>
              </button>

              {dropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                  <div
                    className="absolute right-0 top-10 z-20 w-44 py-1 animate-in-from-top"
                    style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 4 }}
                  >
                    <Link
                      to="/settings"
                      onClick={() => setDropdownOpen(false)}
                      className="block w-full px-4 py-2.5 text-left"
                      style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', textDecoration: 'none', letterSpacing: '0.03em', display: 'block' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#e0e0f0' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8888aa' }}
                    >
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => { supabase.auth.signOut(); setDropdownOpen(false) }}
                      className="w-full px-4 py-2.5 text-left"
                      style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#8888aa', background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.03em' }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = '#1a1a2e'; e.currentTarget.style.color = '#e0e0f0' }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#8888aa' }}
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
              style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 600, color: '#555577', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.06em' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#8888aa' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
            >
              Log in
            </Link>
            <Link
              to="/register"
              style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700, color: '#0c0c14', background: '#ff6b35', borderRadius: 4, padding: '5px 12px', textDecoration: 'none', textTransform: 'uppercase', letterSpacing: '0.06em' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#ff8855' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#ff6b35' }}
            >
              Sign up
            </Link>
          </div>
        )}
      </div>

    </header>
  )
}
