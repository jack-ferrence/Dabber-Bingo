import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Panel from '../ui/Panel.jsx'
import { getFontFamily, getBadge } from '../../lib/fontMap'

const RANK_COLORS = ['text-accent-green', 'text-text-secondary', 'text-text-muted']
const MAX_VISIBLE = 10
const ROW_HEIGHT = 32

function sortRows(a, b) {
  if (b.lines_completed !== a.lines_completed) return b.lines_completed - a.lines_completed
  if (b.squares_marked !== a.squares_marked) return b.squares_marked - a.squares_marked
  return (a.joined_at ?? '').localeCompare(b.joined_at ?? '')
}

function binaryInsert(arr, item) {
  let lo = 0
  let hi = arr.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (sortRows(item, arr[mid]) < 0) lo = mid + 1
    else hi = mid
  }
  arr.splice(lo, 0, item)
  return arr
}

const LeaderboardRow = memo(function LeaderboardRow({
  rank,
  userId,
  username,
  nameColor,
  nameFont,
  equippedBadge,
  linesCompleted,
  squaresMarked,
  isMe,
  isFlashing,
  hasRankChange,
  onNameClick,
}) {
  const rankColor = rank <= 3 ? RANK_COLORS[rank - 1] : 'text-text-muted'
  const badge = equippedBadge ? getBadge(equippedBadge) : null

  return (
    <div
      className={`
        flex items-center gap-2 rounded-md px-2
        transition-all duration-300 ease-out
        ${isMe ? 'border-l-2 border-accent-green bg-bg-hover' : 'border-l-2 border-transparent'}
        ${isFlashing ? 'leaderboard-flash' : ''}
      `}
      style={{ height: ROW_HEIGHT }}
    >
      <span
        className={`w-5 shrink-0 text-right font-display text-[11px] font-bold tabular-nums ${rankColor} ${hasRankChange ? 'rank-change' : ''}`}
      >
        {rank}
      </span>

      <button
        type="button"
        onClick={() => onNameClick?.(userId)}
        className={`min-w-0 flex-1 truncate text-xs font-medium text-left ${nameColor === 'rainbow' ? 'name-rainbow' : ''}`}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          cursor: isMe ? 'default' : 'pointer',
          color: nameColor && nameColor !== 'rainbow' ? nameColor : undefined,
          fontFamily: getFontFamily(nameFont),
        }}
        onMouseEnter={(e) => { if (!isMe) e.currentTarget.style.textDecoration = 'underline'; e.currentTarget.style.textDecorationColor = '#555577' }}
        onMouseLeave={(e) => { e.currentTarget.style.textDecoration = 'none' }}
      >
        {badge && <span style={{ marginRight: 3, fontSize: 11 }}>{badge.emoji}</span>}
        {username.length > 12 ? username.slice(0, 12) + '…' : username}
        {isMe && (
          <span className="ml-1 text-[9px] text-accent-green">(you)</span>
        )}
      </button>

      <span className="shrink-0 font-display text-[10px] tabular-nums text-text-secondary">
        {linesCompleted}/12
      </span>

      <span className="shrink-0 text-[10px] tabular-nums text-text-muted">
        {squaresMarked}/25
      </span>
    </div>
  )
})

function Leaderboard({ roomId, currentUserId, realtimeCards, participantJoined, onPlayerClick }) {
  const [rows, setRows] = useState([])
  const [profiles, setProfiles] = useState({})
  const flashRef = useRef(new Set())
  const [flashIds, setFlashIds] = useState(new Set())
  const prevRanksRef = useRef({})
  const [rankChanges, setRankChanges] = useState({})
  const loadedRef = useRef(false)

  const loadLeaderboard = useCallback(async () => {
    const { data: participants } = await supabase
      .from('room_participants')
      .select('user_id, joined_at')
      .eq('room_id', roomId)

    if (!participants?.length) {
      setRows([])
      return
    }

    const userIds = participants.map((p) => p.user_id)
    const joinMap = Object.fromEntries(participants.map((p) => [p.user_id, p.joined_at]))

    const [{ data: cardsData }, { data: profilesData }] = await Promise.all([
      supabase
        .from('cards')
        .select('user_id, lines_completed, squares_marked')
        .eq('room_id', roomId)
        .in('user_id', userIds),
      supabase
        .from('profiles')
        .select('id, username, name_color, name_font, equipped_badge')
        .in('id', userIds),
    ])

    const pMap = Object.fromEntries((profilesData ?? []).map((p) => [p.id, {
      username:      p.username,
      nameColor:     p.name_color,
      nameFont:      p.name_font,
      equippedBadge: p.equipped_badge,
    }]))
    setProfiles((prev) => ({ ...prev, ...pMap }))

    const built = userIds.map((uid) => {
      const card = (cardsData ?? []).find((c) => c.user_id === uid)
      return {
        user_id: uid,
        lines_completed: card?.lines_completed ?? 0,
        squares_marked: card?.squares_marked ?? 0,
        joined_at: joinMap[uid] ?? '',
      }
    })

    built.sort(sortRows)
    setRows(built)
    loadedRef.current = true
  }, [roomId])

  useEffect(() => {
    if (!roomId) return
    loadLeaderboard()
  }, [roomId, loadLeaderboard])

  // Re-fetch when a new participant joins
  useEffect(() => {
    if (participantJoined > 0 && loadedRef.current) {
      loadLeaderboard()
    }
  }, [participantJoined, loadLeaderboard])

  // Apply realtime card updates via binary insertion instead of full re-sort
  useEffect(() => {
    if (!realtimeCards || realtimeCards.length === 0) return

    setRows((prev) => {
      let next = [...prev]
      for (const updated of realtimeCards) {
        if (!updated?.user_id) continue

        const oldIdx = next.findIndex((r) => r.user_id === updated.user_id)
        const oldRow = oldIdx >= 0 ? next[oldIdx] : null

        if (oldRow && updated.lines_completed > oldRow.lines_completed) {
          flashRef.current.add(updated.user_id)
          setFlashIds(new Set(flashRef.current))
          setTimeout(() => {
            flashRef.current.delete(updated.user_id)
            setFlashIds(new Set(flashRef.current))
          }, 2000)
        }

        const newRow = {
          user_id: updated.user_id,
          lines_completed: updated.lines_completed ?? oldRow?.lines_completed ?? 0,
          squares_marked: updated.squares_marked ?? oldRow?.squares_marked ?? 0,
          joined_at: oldRow?.joined_at ?? '',
        }

        if (oldIdx >= 0) next.splice(oldIdx, 1)
        binaryInsert(next, newRow)
      }
      return next
    })
  }, [realtimeCards])

  const rankedRows = useMemo(() => {
    return rows.map((r, i) => ({ ...r, rank: i + 1 }))
  }, [rows])

  useEffect(() => {
    const changes = {}
    for (const row of rankedRows) {
      const prevRank = prevRanksRef.current[row.user_id]
      if (prevRank !== undefined && prevRank !== row.rank) {
        changes[row.user_id] = true
      }
    }
    prevRanksRef.current = Object.fromEntries(rankedRows.map((r) => [r.user_id, r.rank]))
    if (Object.keys(changes).length > 0) {
      setRankChanges(changes)
      setTimeout(() => setRankChanges({}), 250)
    }
  }, [rankedRows])

  const totalPlayers = rows.length

  const currentUserRank = useMemo(() => {
    const idx = rows.findIndex((r) => r.user_id === currentUserId)
    return idx >= 0 ? idx + 1 : null
  }, [rows, currentUserId])

  const visibleRows = useMemo(() => {
    if (rankedRows.length <= MAX_VISIBLE + 2) return rankedRows

    const top = rankedRows.slice(0, MAX_VISIBLE)
    const currentIdx = rankedRows.findIndex((r) => r.user_id === currentUserId)

    if (currentIdx >= 0 && currentIdx >= MAX_VISIBLE) {
      top.push({ _separator: true })
      top.push(rankedRows[currentIdx])
    }

    return top
  }, [rankedRows, currentUserId])

  if (!roomId) return null

  return (
    <Panel title="Leaderboard">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-medium text-text-muted">
          {totalPlayers} player{totalPlayers === 1 ? '' : 's'}
        </span>
        {currentUserRank && (
          <span className="text-[10px] font-medium text-accent-gold">
            You: #{currentUserRank}
          </span>
        )}
      </div>

      <div className="max-h-64 overflow-y-auto scrollbar-thin">
        <div className="relative">
          {visibleRows.map((row) => {
            if (row._separator) {
              return (
                <div key="sep" className="flex items-center justify-center" style={{ height: ROW_HEIGHT }}>
                  <span className="text-[10px] text-text-muted">···</span>
                </div>
              )
            }

            return (
              <LeaderboardRow
                key={row.user_id}
                rank={row.rank}
                userId={row.user_id}
                username={profiles[row.user_id]?.username ?? 'Guest'}
                nameColor={profiles[row.user_id]?.nameColor ?? null}
                nameFont={profiles[row.user_id]?.nameFont ?? 'default'}
                equippedBadge={profiles[row.user_id]?.equippedBadge ?? null}
                linesCompleted={row.lines_completed}
                squaresMarked={row.squares_marked}
                isMe={row.user_id === currentUserId}
                isFlashing={flashIds.has(row.user_id)}
                hasRankChange={!!rankChanges[row.user_id]}
                onNameClick={(uid) => onPlayerClick?.(uid, profiles[uid]?.username ?? 'Guest')}
              />
            )
          })}

          {rows.length === 0 && (
            <p className="py-2 text-center text-xs text-text-muted">
              No players yet.
            </p>
          )}
        </div>
      </div>
    </Panel>
  )
}

export default memo(Leaderboard)
