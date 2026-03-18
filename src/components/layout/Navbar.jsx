import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.js'
import DabberLogo from '../ui/DabberLogo.jsx'

export default function Navbar({ onMenuClick }) {
  const { user, loading } = useAuth()
  const { dabsBalance, username: profileUsername } = useProfile()
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

        {/* Left: hamburger + wordmark */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden"
            style={{ color: '#555577', background: 'none', border: 'none', padding: '4px', cursor: 'pointer' }}
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link
            to="/"
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}
          >
            <DabberLogo size={26} />
            <span className="navbar-wordmark" style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 800, letterSpacing: '4px', color: '#e0e0f0', lineHeight: 1 }}>
              DABBER
            </span>
          </Link>
        </div>

        {/* Right: user area */}
        {loading ? null : user ? (
          <div className="flex items-center gap-3">

            {/* Store link */}
            <Link
              to="/store"
              style={{
                fontFamily: 'var(--db-font-mono)', fontSize: 11, fontWeight: 700,
                letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none',
                color: isStore ? '#ff6b35' : '#555577',
                display: 'flex', alignItems: 'center', gap: 4,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = '#ff6b35' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = isStore ? '#ff6b35' : '#555577' }}
            >
              <span style={{ fontSize: 13 }}>◈</span>
              <span className="hidden sm:inline">STORE</span>
            </Link>

            {/* Dabs balance */}
            {dabsBalance !== null && (
              <Link
                to="/store"
                title="Open Dabs Store"
                className="hidden sm:flex items-center"
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
                  {dabsBalance.toLocaleString()}
                </span>
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: '#555577', marginLeft: 3 }}>
                  DABS
                </span>
              </Link>
            )}

            {/* User button + dropdown */}
            <div className="relative">
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
