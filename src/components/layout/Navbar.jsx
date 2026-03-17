import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.js'
import SportTabs from './SportTabs.jsx'

export default function Navbar({ onMenuClick }) {
  const { user, loading } = useAuth()
  const { dabsBalance } = useProfile()
  const [dropdownOpen, setDropdownOpen] = useState(false)

  return (
    <header
      className="flex-shrink-0 z-50"
      style={{
        background: 'rgba(237,235,232,0.95)',
        backdropFilter: 'blur(8px)',
        borderBottom: '1px solid #D5D0CA',
      }}
    >
      {/* Top row */}
      <div className="flex h-14 items-center justify-between px-4">
        {/* Left: hamburger (mobile) + wordmark */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuClick}
            className="md:hidden rounded p-1.5 transition-colors hover:bg-[#E3E0DC]"
            style={{ color: '#9A9490' }}
            aria-label="Open menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <Link
            to="/"
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 28,
              letterSpacing: '0.15em',
              color: '#E44D2E',
              textDecoration: 'none',
              lineHeight: 1,
            }}
          >
            DABBER
          </Link>
        </div>

        {/* Right: user area */}
        {loading ? null : user ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2.5 rounded-full transition-opacity hover:opacity-80"
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
                style={{ background: '#E44D2E', color: '#FFF' }}
              >
                {user.is_anonymous ? 'G' : (user.email?.[0]?.toUpperCase() ?? 'U')}
              </span>
              {dabsBalance !== null && (
                <span
                  className="hidden sm:inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold"
                  style={{ background: 'rgba(228,77,46,0.10)', color: '#E44D2E', border: '1px solid rgba(228,77,46,0.20)' }}
                >
                  <span style={{ fontSize: 11 }}>◈</span>
                  {dabsBalance.toLocaleString()}
                </span>
              )}
              <span
                className="hidden sm:block max-w-[160px] truncate text-sm"
                style={{ color: '#5C5752' }}
              >
                {user.is_anonymous ? `Guest_${user.id.slice(0, 6)}` : user.email}
              </span>
            </button>

            {dropdownOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setDropdownOpen(false)} />
                <div
                  className="absolute right-0 top-11 z-20 w-44 rounded-lg py-1 shadow-xl animate-in-from-top"
                  style={{ background: '#F5F3F0', border: '1px solid #D5D0CA' }}
                >
                  <button
                    type="button"
                    onClick={() => { supabase.auth.signOut(); setDropdownOpen(false) }}
                    className="w-full px-4 py-2.5 text-left text-sm transition-colors"
                    style={{ color: '#5C5752' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = '#E3E0DC'; e.currentTarget.style.color = '#2D2A26' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#5C5752' }}
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="text-sm transition-colors hover:text-[#2D2A26]"
              style={{ color: '#9A9490' }}
            >
              Log in
            </Link>
            <Link
              to="/register"
              className="rounded-lg px-4 py-1.5 text-xs font-bold transition-all hover:bg-[#F0705A]"
              style={{ background: '#E44D2E', color: '#FFF' }}
            >
              Sign up
            </Link>
          </div>
        )}
      </div>

      {/* Sport tabs */}
      <SportTabs />
    </header>
  )
}
