import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { EMOTE_MAP } from '../../lib/fontMap'

export default function EmotePicker({ userId, onQuickReact }) {
  const [open, setOpen] = useState(false)
  const [ownedEmotes, setOwnedEmotes] = useState([])
  const ref = useRef(null)

  useEffect(() => {
    if (!userId) return
    supabase
      .from('user_inventory')
      .select('item_id')
      .eq('user_id', userId)
      .in('item_id', Object.keys(EMOTE_MAP))
      .then(({ data }) => {
        setOwnedEmotes((data ?? []).map((r) => r.item_id))
      })
  }, [userId])

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Emotes"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: open ? 'var(--db-primary)' : 'var(--db-text-ghost)', fontSize: 14, padding: '10px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, lineHeight: 1, transition: 'color 100ms ease' }}
        onMouseEnter={(e) => { if (!open) e.currentTarget.style.color = 'var(--db-text-secondary)' }}
        onMouseLeave={(e) => { if (!open) e.currentTarget.style.color = 'var(--db-text-ghost)' }}
      >
        😊
      </button>

      {open && (
        <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-default)', borderRadius: 8, padding: 8, zIndex: 50, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
          {ownedEmotes.length === 0 ? (
            <div style={{ padding: '4px 2px' }}>
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-ghost)', margin: '0 0 6px' }}>No emotes owned.</p>
              <Link to="/store?tab=chat_emote"
                style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--db-primary)', textDecoration: 'none' }}
                onClick={() => setOpen(false)}
              >
                Get emotes in the Store →
              </Link>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 28px)', gap: 2 }}>
              {ownedEmotes.map((itemId) => {
                const emote = EMOTE_MAP[itemId]
                if (!emote) return null
                return (
                  <button
                    key={itemId}
                    type="button"
                    title={emote.code}
                    onClick={() => { onQuickReact?.(emote.code); setOpen(false) }}
                    style={{ width: 28, height: 28, borderRadius: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background 100ms ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}
                  >
                    {emote.emoji}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
