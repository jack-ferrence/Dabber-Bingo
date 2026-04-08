import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth.jsx'
import { useProfile } from '../../hooks/useProfile.js'
import MyGameItem from '../home/MyGameItem.jsx'
import DobberBallIcon from '../ui/DobberBallIcon.jsx'

function SidebarContent({ onClose }) {
  const { user } = useAuth()
  const { username: profileUsername } = useProfile()
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

  const displayName = user
    ? (profileUsername ?? (user.is_anonymous ? `Guest_${user.id.slice(0, 6)}` : (user.email ?? 'Player')))
    : null

  const initials = displayName
    ? displayName[0].toUpperCase()
    : '?'

  return (
    <div className="flex h-full flex-col overflow-hidden">

      {/* ── My Games ── */}
      <div className="flex-1 overflow-y-auto scrollbar-thin py-4">
        <p
          className="px-5 mb-2"
          style={{ fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.18em', color: '#ff6b35' }}
        >
          YOUR GAMES
        </p>

        {!user ? (
          <div className="mx-4 mt-2">
            <div
              className="rounded-lg px-4 py-5 text-center"
              style={{ border: '1px dashed var(--db-border-default)' }}
            >
              <p className="text-xs" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)' }}>
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
              style={{ border: '1px dashed var(--db-border-default)' }}
            >
              <p className="text-xs" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)' }}>
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
        style={{ borderTop: '1px solid var(--db-border-subtle)' }}
      >
        {/* User info */}
        {user && (
          <div className="flex items-center gap-3 pb-3 mb-1" style={{ borderBottom: '1px solid var(--db-border-subtle)' }}>
            <span
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center text-xs font-bold"
              style={{ background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)', color: '#fff', borderRadius: 4, fontFamily: 'var(--db-font-ui)', fontWeight: 800, boxShadow: '0 2px 8px rgba(255,107,53,0.35)' }}
            >
              {initials}
            </span>
            <p className="truncate text-xs" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)', maxWidth: 160 }}>
              {displayName}
            </p>
          </div>
        )}

        {user && (
          <Link
            to="/settings"
            onClick={() => onClose?.()}
            className="text-xs"
            style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-ghost)', textDecoration: 'none', transition: 'color 120ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-ghost)' }}
          >
            Settings
          </Link>
        )}

        <Link
          to="/contribute"
          onClick={() => onClose?.()}
          className="flex items-center gap-2 text-xs"
          style={{ fontFamily: 'var(--db-font-ui)', color: 'rgba(255,107,53,0.55)', textDecoration: 'none', transition: 'color 120ms ease' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,107,53,0.9)' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,107,53,0.55)' }}
        >
          <DobberBallIcon size={12} />
          Support Dobber
        </Link>

        <p className="text-[10px]" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-ghost)' }}>Dobber v0.1</p>
      </div>
    </div>
  )
}

export default function Sidebar({ open, onClose }) {
  const sidebarStyle = {
    background: 'var(--db-bg-surface)',
    borderRight: '1px solid var(--db-border-subtle)',
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
            style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <aside
            className="relative flex flex-col"
            style={{ ...sidebarStyle, width: 280 }}
          >
            {/* Mobile header with close */}
            <div
              className="flex h-12 flex-shrink-0 items-center justify-between px-5"
              style={{ borderBottom: '1px solid var(--db-border-subtle)' }}
            >
              <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 10, letterSpacing: '0.18em', color: '#ff6b35' }}>
                YOUR GAMES
              </span>
              <button
                type="button"
                onClick={onClose}
                style={{ color: 'var(--db-text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, transition: 'color 120ms ease' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-secondary)' }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-ghost)' }}
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
