import { memo, useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import Panel from '../ui/Panel.jsx'
import { getFontFamily, getBadge } from '../../lib/fontMap'

const BINGO_LINES = [
  [0,1,2,3,4],[5,6,7,8,9],[10,11,12,13,14],[15,16,17,18,19],[20,21,22,23,24],
  [0,5,10,15,20],[1,6,11,16,21],[2,7,12,17,22],[3,8,13,18,23],[4,9,14,19,24],
  [0,6,12,18,24],[4,8,12,16,20],
]

function countFromSquares(squares) {
  if (!Array.isArray(squares)) return null
  const flat = squares.flat()
  if (flat.length !== 25) return null
  const markedSet = new Set(flat.map((s, i) => (s?.marked === true || i === 12) ? i : -1).filter((i) => i >= 0))
  const squaresMarked = flat.filter((s, i) => s?.marked === true && i !== 12).length
  const linesCompleted = BINGO_LINES.filter((line) => line.every((i) => markedSet.has(i))).length
  return { squaresMarked, linesCompleted }
}

const RANK_COLORS = ['text-accent-green', 'text-text-secondary', 'text-text-muted']
const MAX_VISIBLE = 10
const ROW_HEIGHT = 40

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
  const badge = equippedBadge ? getBadge(equippedBadge) : null
  const rankDisplay = rank <= 3 ? ['🥇','🥈','🥉'][rank-1] : rank

  return (
    <div
      className={`flex items-center gap-3 rounded-lg px-3 transition-all duration-300 ease-out ${isFlashing ? 'leaderboard-flash' : ''}`}
      style={{
        height: 40,
        background: isMe ? 'rgba(34,197,94,0.08)' : 'transparent',
        borderLeft: isMe ? '3px solid #22c55e' : '3px solid transparent',
      }}
    >
      {/* Rank */}
      <span style={{
        width: 24, textAlign: 'center', flexShrink: 0,
        fontFamily: rank <= 3 ? 'inherit' : 'var(--db-font-display)',
        fontSize: rank <= 3 ? 16 : 13,
        color: rank <= 3 ? undefined : 'rgba(255,255,255,0.4)',
      }}>{rankDisplay}</span>

      {/* Name */}
      <button
        type="button"
        onClick={() => onNameClick?.(userId)}
        style={{
          flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0,
          cursor: isMe ? 'default' : 'pointer',
          fontFamily: getFontFamily(nameFont),
          fontSize: 13, fontWeight: 600,
          color: nameColor && nameColor !== 'rainbow' ? nameColor : isMe ? '#22c55e' : 'rgba(255,255,255,0.75)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}
      >
        {badge && <span style={{ marginRight: 4, fontSize: 13 }}>{badge.emoji}</span>}
        {username.length > 14 ? username.slice(0, 14) + '…' : username}
        {isMe && <span style={{ marginLeft: 4, fontSize: 10, color: '#22c55e', opacity: 0.7 }}>(you)</span>}
      </button>

      {/* Stats */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700,
          color: linesCompleted > 0 ? '#ff6b35' : 'rgba(255,255,255,0.3)',
        }}>{linesCompleted}<span style={{ fontSize: 9, opacity: 0.5 }}>/12</span></span>
        <span style={{
          fontFamily: 'var(--db-font-mono)', fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
        }}>{squaresMarked}/25</span>
      </div>
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
        .select('user_id, lines_completed, squares_marked, squares, late_join')
        .eq('room_id', roomId)
        .eq('late_join', false)
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
      const fromSquares = card ? countFromSquares(card.squares) : null
      return {
        user_id: uid,
        lines_completed: fromSquares?.linesCompleted ?? card?.lines_completed ?? 0,
        squares_marked: fromSquares?.squaresMarked ?? card?.squares_marked ?? 0,
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
        if (updated.late_join) continue  // Late joiners excluded from leaderboard

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

        const fromSquares = countFromSquares(updated.squares)
        const newRow = {
          user_id: updated.user_id,
          lines_completed: fromSquares?.linesCompleted ?? updated.lines_completed ?? oldRow?.lines_completed ?? 0,
          squares_marked: fromSquares?.squaresMarked ?? updated.squares_marked ?? oldRow?.squares_marked ?? 0,
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
        <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 500, color: 'rgba(255,255,255,0.5)' }}>
          {totalPlayers} player{totalPlayers === 1 ? '' : 's'}
        </span>
        {currentUserRank && (
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 700, color: '#FFD700' }}>
            You: #{currentUserRank}
          </span>
        )}
      </div>

      <div className="max-h-80 overflow-y-auto scrollbar-thin">
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
