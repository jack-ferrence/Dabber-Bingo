import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Panel from '../ui/Panel.jsx'
import { getFontFamily, getBadge, EMOTE_CODE_MAP } from '../../lib/fontMap'
import EmotePicker from '../chat/EmotePicker.jsx'
import BadgeEmoji from '../ui/BadgeEmoji.jsx'

const MAX_CHAT = 100
const MAX_CHARS = 280
const RATE_LIMIT_MS = 2000
const SCROLL_THROTTLE_MS = 200

const USER_COLORS = ['#ff6b35', '#8b5cf6', '#22c55e', '#3b82f6', '#f59e0b', '#c0c0d8', '#ff8855', '#8888aa']

function userColor(userId) {
  let hash = 0
  for (let i = 0; i < userId.length; i++) {
    hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0
  }
  return USER_COLORS[Math.abs(hash) % USER_COLORS.length]
}

function renderMessageText(text) {
  let result = text
  for (const [code, emoji] of Object.entries(EMOTE_CODE_MAP)) {
    result = result.split(code).join(emoji)
  }
  return result
}

function isEmoteOnly(text) {
  return EMOTE_CODE_MAP[text?.trim()] != null
}

const ChatMessage = memo(function ChatMessage({ msg, isNew, profile }) {
  const nameColor = profile?.nameColor || userColor(msg.user_id)
  const fontFamily = getFontFamily(profile?.nameFont)
  const badge = profile?.equippedBadge ? getBadge(profile.equippedBadge) : null

  if (isEmoteOnly(msg.message)) {
    const emoji = EMOTE_CODE_MAP[msg.message.trim()]
    return (
      <div className={`px-1 ${isNew ? 'chat-msg-in' : ''}`} style={{ fontSize: 11, lineHeight: 1.4 }}>
        {badge && <BadgeEmoji emoji={badge.emoji} size={12} />}
        <span style={{ fontFamily, fontWeight: 700, color: nameColor }}>{msg.username}</span>
        <span style={{ marginLeft: 5, fontSize: 18 }}>{emoji}</span>
      </div>
    )
  }

  return (
    <div className={`px-1 leading-relaxed break-words ${isNew ? 'chat-msg-in' : ''}`} style={{ fontSize: 11 }}>
      {badge && <span style={{ marginRight: 2 }}>{badge.emoji}</span>}
      <span style={{ fontFamily, fontWeight: 700, color: nameColor }}>
        {msg.username}
      </span>
      <span style={{ color: 'rgba(255,255,255,0.4)' }}>: </span>
      <span style={{ color: 'rgba(255,255,255,0.5)' }}>{renderMessageText(msg.message)}</span>
    </div>
  )
})

function LiveChat({ roomId, userId, username, realtimeMessages, initChatMessages }) {
  const [localMessages, setLocalMessages] = useState([])
  const [chatProfiles, setChatProfiles] = useState({})
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [slowDown, setSlowDown] = useState(false)
  const [floatingEmotes, setFloatingEmotes] = useState([])
  const lastSentRef = useRef(0)
  const listRef = useRef(null)
  const isNearBottomRef = useRef(true)
  const [animatedIds] = useState(() => new Set())
  const scrollThrottleRef = useRef(null)
  const initialLoadRef = useRef(false)
  const knownProfileIds = useRef(new Set())
  const seenEmoteIds = useRef(new Set())

  const fetchProfiles = useCallback(async (userIds) => {
    const unknown = userIds.filter((id) => !knownProfileIds.current.has(id))
    if (unknown.length === 0) return
    for (const id of unknown) knownProfileIds.current.add(id)
    const { data } = await supabase
      .from('profiles')
      .select('id, name_color, name_font, equipped_badge')
      .in('id', unknown)
    if (data) {
      setChatProfiles((prev) => {
        const next = { ...prev }
        for (const p of data) {
          next[p.id] = { nameColor: p.name_color, nameFont: p.name_font, equippedBadge: p.equipped_badge }
        }
        return next
      })
    }
  }, [])

  const throttledScrollToBottom = useCallback(() => {
    if (scrollThrottleRef.current) return
    scrollThrottleRef.current = setTimeout(() => {
      scrollThrottleRef.current = null
      const el = listRef.current
      if (el) el.scrollTop = el.scrollHeight
    }, SCROLL_THROTTLE_MS)
  }, [])

  const checkNearBottom = useCallback(() => {
    const el = listRef.current
    if (!el) return
    isNearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }, [])

  // Initial fetch
  useEffect(() => {
    if (!roomId || initialLoadRef.current) return
    initialLoadRef.current = true

    const fetchMessages = async () => {
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('room_id', roomId)
        .order('created_at', { ascending: true })
        .limit(MAX_CHAT)
      const msgs = data ?? []
      setLocalMessages(msgs)
      // Mark existing messages as seen so they don't float on initial load
      for (const m of msgs) seenEmoteIds.current.add(m.id)
      if (initChatMessages) initChatMessages(msgs)
      fetchProfiles(msgs.map((m) => m.user_id))
      requestAnimationFrame(() => {
        const el = listRef.current
        if (el) el.scrollTop = el.scrollHeight
      })
    }

    fetchMessages()
  }, [roomId, initChatMessages])

  // Merge realtime messages + trigger floating emotes for new ones
  useEffect(() => {
    if (!realtimeMessages || realtimeMessages.length === 0) return

    setLocalMessages((prev) => {
      const existingIds = new Set(prev.map((m) => m.id))
      const newMsgs = realtimeMessages.filter((m) => !existingIds.has(m.id))
      if (newMsgs.length === 0) return prev

      fetchProfiles(newMsgs.map((m) => m.user_id))
      for (const m of newMsgs) animatedIds.add(m.id)

      // Float emote-only messages that are truly new (not from initial load)
      const floaters = []
      for (const m of newMsgs) {
        if (!seenEmoteIds.current.has(m.id) && isEmoteOnly(m.message)) {
          floaters.push({
            id: m.id,
            emoji: EMOTE_CODE_MAP[m.message.trim()],
            username: m.username,
            x: 15 + Math.random() * 60,
            createdAt: Date.now(),
          })
        }
        seenEmoteIds.current.add(m.id)
      }
      if (floaters.length > 0) {
        setFloatingEmotes((prev) => [...prev, ...floaters])
      }

      const next = [...prev, ...newMsgs]
      if (isNearBottomRef.current) throttledScrollToBottom()
      return next.length > MAX_CHAT ? next.slice(-MAX_CHAT) : next
    })
  }, [realtimeMessages, throttledScrollToBottom, animatedIds, fetchProfiles])

  // Clean up floaters after animation
  useEffect(() => {
    if (floatingEmotes.length === 0) return
    const timer = setTimeout(() => {
      setFloatingEmotes((prev) => prev.filter((e) => Date.now() - e.createdAt < 2500))
    }, 2500)
    return () => clearTimeout(timer)
  }, [floatingEmotes])

  const handleSend = useCallback(async () => {
    const text = input.trim()
    if (!text || !roomId || !userId || sending) return

    const now = Date.now()
    if (now - lastSentRef.current < RATE_LIMIT_MS) {
      setSlowDown(true)
      setTimeout(() => setSlowDown(false), 1500)
      return
    }

    setSending(true)
    lastSentRef.current = now

    await supabase.from('chat_messages').insert({
      room_id: roomId,
      user_id: userId,
      username: username || 'Guest',
      message: text,
    })

    setInput('')
    setSending(false)
  }, [input, roomId, userId, username, sending])

  const handleQuickReact = useCallback(async (code) => {
    if (!roomId || !userId) return
    const now = Date.now()
    if (now - lastSentRef.current < RATE_LIMIT_MS) return
    lastSentRef.current = now
    await supabase.from('chat_messages').insert({
      room_id: roomId,
      user_id: userId,
      username: username || 'Guest',
      message: code,
    })
  }, [roomId, userId, username])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }, [handleSend])

  if (!roomId) return null

  return (
    <Panel title="Chat" className="flex flex-col">
      <div style={{ position: 'relative' }}>
        <div
          ref={listRef}
          onScroll={checkNearBottom}
          className="flex-1 overflow-y-auto scrollbar-thin"
          style={{ maxHeight: '12rem' }}
          aria-live="polite"
        >
          {localMessages.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-muted">
              No messages yet. Say hi!
            </p>
          ) : (
            <div className="space-y-0.5 py-1">
              {localMessages.map((msg) => (
                <ChatMessage
                  key={msg.id}
                  msg={msg}
                  isNew={animatedIds.has(msg.id)}
                  profile={chatProfiles[msg.user_id]}
                />
              ))}
            </div>
          )}
        </div>

        {/* Floating emotes overlay */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 10 }}>
          {floatingEmotes.map((fe) => (
            <div
              key={fe.id}
              style={{
                position: 'absolute',
                bottom: 0,
                left: `${fe.x}%`,
                animation: 'emoteFloat 2s ease-out forwards',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <span style={{ fontSize: 28 }}>{fe.emoji}</span>
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 8, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap' }}>
                {fe.username}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-2 border-t border-border-subtle pt-2">
        {slowDown && (
          <p className="mb-1 text-[10px] font-medium text-accent-red animate-in-from-top">
            Slow down — 1 message every 2 seconds.
          </p>
        )}

        <div className="flex gap-1.5">
          <label htmlFor="chat-input" className="sr-only">
            Chat message
          </label>
          <input
            id="chat-input"
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value.slice(0, MAX_CHARS))}
            onKeyDown={handleKeyDown}
            disabled={sending}
            placeholder="Send a message..."
            className="min-w-0 flex-1 rounded-md border border-border-subtle bg-bg-card px-2.5 py-1.5 text-xs text-text-primary placeholder:text-text-muted focus:border-accent-purple focus:outline-none focus:ring-1 focus:ring-accent-purple disabled:opacity-50"
          />
          <EmotePicker userId={userId} onQuickReact={handleQuickReact} />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="shrink-0 rounded-md bg-accent-purple px-2.5 py-1.5 text-xs font-medium text-white transition hover:bg-accent-purple/80 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Send
          </button>
        </div>

        {input.length > 200 && (
          <p className="mt-0.5 text-right text-[10px] tabular-nums text-text-muted">
            {input.length}/{MAX_CHARS}
          </p>
        )}
      </div>
    </Panel>
  )
}

export default memo(LiveChat)
