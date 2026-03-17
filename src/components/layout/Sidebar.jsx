import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import MyGameItem from '../home/MyGameItem.jsx'

function SidebarContent({ onClose }) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [myRooms, setMyRooms] = useState([])

  useEffect(() => {
    if (!user) { setMyRooms([]); return }

    const load = async () => {
      const [{ data: participants }, { data: rooms }] = await Promise.all([
        supabase.from('room_participants').select('room_id').eq('user_id', user.id),
        supabase
          .from('rooms_with_counts')
          .select('*')
          .in('status', ['lobby', 'live'])
          .order('created_at', { ascending: false }),
      ])

      if (!participants || !rooms) return

      const joined = new Set(participants.map((p) => p.room_id))
      const myList = rooms.filter((r) => joined.has(r.id))

      if (myList.length === 0) { setMyRooms([]); return }

      // Fetch card progress
      const { data: cards } = await supabase
        .from('cards')
        .select('room_id, lines_completed, squares_marked')
        .eq('user_id', user.id)
        .in('room_id', myList.map((r) => r.id))

      const cardsByRoom = {}
      for (const c of cards ?? []) cardsByRoom[c.room_id] = c

      setMyRooms(
        myList.map((r) => ({
          ...r,
          lines_completed: cardsByRoom[r.id]?.lines_completed ?? 0,
          squares_marked: cardsByRoom[r.id]?.squares_marked ?? 0,
        }))
      )
    }

    load()
  }, [user])

  const handleSignOut = async () => {
    await signOut()
    onClose?.()
    navigate('/login')
  }

  const displayName = user
    ? user.is_anonymous
      ? `Guest_${user.id.slice(0, 6)}`
      : (user.email ?? 'Player')
    : null

  const initials = displayName
    ? displayName[0].toUpperCase()
    : '?'

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Logo ── */}
      <div
        className="flex-shrink-0 flex items-center px-5 py-5"
        style={{ borderBottom: '1px solid #2a2a44' }}
      >
        <Link
          to="/"
          onClick={() => onClose?.()}
          style={{
            fontFamily: 'var(--db-font-display)',
            fontSize: 26,
            letterSpacing: '0.18em',
            color: '#ff6b35',
            textDecoration: 'none',
            lineHeight: 1,
          }}
        >
          DABBER
        </Link>
      </div>

      {/* ── User info ── */}
      {user && (
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid #2a2a44' }}
        >
          <span
            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={{ background: '#ff6b35', color: '#0c0c14' }}
          >
            {initials}
          </span>
          <p
            className="truncate text-sm font-medium"
            style={{ color: '#8888aa', maxWidth: 160 }}
          >
            {displayName}
          </p>
        </div>
      )}

      {/* ── My Games ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-4">
        <p
          className="px-5 mb-2"
          style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#ff6b35' }}
        >
          My Games
        </p>

        {!user ? (
          <div className="mx-4 mt-2">
            <div
              className="rounded-lg px-4 py-5 text-center"
              style={{
                border: '1px dashed #2a2a44',
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              <p className="text-xs" style={{ color: '#555577' }}>
                No active games.{' '}
                <Link
                  to="/login"
                  onClick={() => onClose?.()}
                  style={{ color: '#ff6b35' }}
                >
                  Log in
                </Link>{' '}
                →
              </p>
            </div>
          </div>
        ) : myRooms.length === 0 ? (
          <div className="mx-4 mt-2">
            <div
              className="rounded-lg px-4 py-5 text-center"
              style={{
                border: '1px dashed #2a2a44',
                background: 'rgba(0,0,0,0.02)',
              }}
            >
              <p className="text-xs" style={{ color: '#555577' }}>
                No active games. Join one →
              </p>
            </div>
          </div>
        ) : (
          <ul className="space-y-0.5 px-2">
            {myRooms.map((room) => (
              <li key={room.id}>
                <MyGameItem room={room} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Bottom ── */}
      <div
        className="flex-shrink-0 px-5 py-4 space-y-2"
        style={{ borderTop: '1px solid #2a2a44' }}
      >
        <Link
          to="/"
          onClick={() => onClose?.()}
          className="flex items-center gap-2 text-xs transition-colors"
          style={{ color: '#555577' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#555577' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          How to Play
        </Link>

        {user && (
          <button
            type="button"
            onClick={handleSignOut}
            className="block text-xs transition-colors"
            style={{ color: '#555577', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#ff2d2d' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
          >
            Sign Out
          </button>
        )}

        <p className="text-[10px]" style={{ color: '#555577' }}>Dabber v0.1</p>
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const sidebarStyle = {
    background: '#1a1a2e',
    borderRight: '1px solid #2a2a44',
  }

  return (
    <>
      {/* Desktop — always visible, part of grid */}
      <aside
        className="hidden md:flex flex-col overflow-hidden"
        style={{ ...sidebarStyle, width: 260, height: '100%' }}
      >
        <SidebarContent />
      </aside>

      {/* Mobile — hamburger-triggered overlay */}
      {open && (
        <div className="md:hidden fixed inset-0 z-40 flex">
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <aside
            className="relative flex flex-col"
            style={{ ...sidebarStyle, width: 280 }}
          >
            {/* Mobile header with close */}
            <div
              className="flex h-14 flex-shrink-0 items-center justify-between px-5"
              style={{ borderBottom: '1px solid #2a2a44' }}
            >
              <span
                style={{
                  fontFamily: 'var(--db-font-display)',
                  fontSize: 22,
                  letterSpacing: '0.18em',
                  color: '#ff6b35',
                }}
              >
                DABBER
              </span>
              <button
                type="button"
                onClick={onClose}
                style={{ color: '#555577' }}
                aria-label="Close menu"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SidebarContent onClose={onClose} />
          </aside>
        </div>
      )}
    </>
  )
}
