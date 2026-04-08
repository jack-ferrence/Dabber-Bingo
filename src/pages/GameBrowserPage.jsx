import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useCountdown } from '../hooks/useCountdown.js'
import { useFocusTrap } from '../hooks/useFocusTrap.js'

function GameCountdown({ date }) {
  const { total, hours, minutes, seconds, isExpired } = useCountdown(date)
  if (!date || isExpired) return <span>Starting soon…</span>
  if (total < 5 * 60_000) return <span>Starts in {minutes}m {String(seconds).padStart(2, '0')}s</span>
  if (hours > 0) return <span>Starts in {hours}h {minutes}m</span>
  return <span>Starts in {minutes}m</span>
}

function GameBrowserPage() {
  const { user } = useAuth()
  const navigate = useNavigate()

  const [games, setGames] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creatingGameId, setCreatingGameId] = useState(null)
  const [customName, setCustomName] = useState('')
  const [createError, setCreateError] = useState('')
  const [createLoading, setCreateLoading] = useState(false)

  const closeCreateModal = () => {
    if (createLoading) return
    setCreatingGameId(null)
    setCustomName('')
    setCreateError('')
  }
  const createTrapRef = useFocusTrap(!!creatingGameId, { onEscape: closeCreateModal })

  useEffect(() => {
    const fetchGames = async () => {
      setLoading(true)
      setError('')
      try {
        const res = await fetch('/.netlify/functions/get-games')
        if (!res.ok) throw new Error(`Failed to load games (${res.status})`)
        const data = await res.json()
        setGames(data.games ?? [])
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    fetchGames()
  }, [])

  const handleCreateRoom = async (game) => {
    if (!user) return
    setCreateError('')
    setCreateLoading(true)

    const roomName = (customName.trim() || `${game.away.abbr} @ ${game.home.abbr}`).slice(0, 50)
    if (roomName.length < 3) {
      setCreateError('Room name must be 3–50 characters.')
      setCreateLoading(false)
      return
    }

    const { data, error: roomError } = await supabase
      .from('rooms')
      .insert({
        name: roomName,
        game_id: game.id,
        sport: game.sport ?? 'nba',
        status: 'lobby',
        starts_at: game.date || null,
        created_by: user.id,
      })
      .select()
      .single()

    if (roomError) {
      setCreateError(roomError.message)
      setCreateLoading(false)
      return
    }

    // Charge entry fee before inserting participant
    try {
      const { data: feeResult, error: rpcError } = await supabase.rpc('deduct_entry_fee', {
        p_user_id: user.id,
        p_room_id: data.id,
      })
      if (rpcError) {
        const isMissing = rpcError.code === 'PGRST202' || rpcError.code === '42883' ||
          rpcError.message?.toLowerCase().includes('function')
        if (!isMissing) {
          setCreateError('Failed to process entry fee: ' + rpcError.message)
          setCreateLoading(false)
          return
        }
      } else if (feeResult && !feeResult.success) {
        if (feeResult.reason === 'insufficient_dabs') {
          setCreateError(`Not enough Dobs! You need 10 but only have ${feeResult.balance}.`)
        } else {
          setCreateError('Could not process entry fee: ' + feeResult.reason)
        }
        setCreateLoading(false)
        return
      }
    } catch (feeErr) {
      console.warn('[GameBrowserPage] deduct_entry_fee threw', feeErr)
    }

    await supabase
      .from('room_participants')
      .insert({ room_id: data.id, user_id: user.id })

    setCreateLoading(false)
    setCreatingGameId(null)
    setCustomName('')
    navigate(`/room/${data.id}`)
  }

  return (
    <div className="space-y-6 px-4 py-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 40,
              color: 'var(--db-text-primary)',
              lineHeight: 1,
              letterSpacing: '0.02em',
            }}
          >
            Tonight&apos;s NBA Games
          </h1>
          <p className="mt-2 text-sm" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)' }}>
            Pick a game to create a bingo room.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
          style={{
            background: 'var(--db-bg-elevated)',
            color: 'var(--db-text-muted)',
            border: '1px solid var(--db-border-default)',
            borderRadius: 8,
            fontFamily: 'var(--db-font-ui)',
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          ← Back to Lobby
        </button>
      </div>

      {error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: 'rgba(255,45,45,0.08)',
            border: '1px solid rgba(255,45,45,0.3)',
            color: 'var(--db-live)',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="loading-pulse flex min-h-[200px] items-center justify-center text-sm" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-ghost)' }}>
          Loading games from ESPN…
        </div>
      ) : games.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)' }}>No games on the schedule today.</p>
          <p className="text-xs" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)' }}>Games are typically available on NBA and MLB game days.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 card-stagger-wrap">
          {games.map((game) => (
            <div
              key={game.id}
              className="relative flex flex-col justify-between rounded-xl p-5"
              style={{ background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-subtle)' }}
            >
              {game.isLive && (
                <span
                  className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(255,45,45,0.15)', color: 'var(--db-live)', border: '1px solid rgba(255,45,45,0.3)' }}
                >
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Live
                </span>
              )}

              {game.isFinished && (
                <span
                  className="absolute right-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: 'var(--db-bg-hover)', color: 'var(--db-text-ghost)', border: '1px solid var(--db-border-default)', fontFamily: 'var(--db-font-display)', letterSpacing: '0.06em' }}
                >
                  Final
                </span>
              )}

              <div className="space-y-3">
                <TeamRow team={game.away} showScore={game.isLive || game.isFinished} />
                <div style={{ height: 1, background: 'var(--db-border-subtle)' }} />
                <TeamRow team={game.home} showScore={game.isLive || game.isFinished} />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-ghost)' }}>
                  {game.isLive
                    ? game.statusDetail
                    : game.isFinished
                      ? 'Final'
                      : <GameCountdown date={game.date} />}
                </div>

                {!game.isFinished && (
                  <button
                    type="button"
                    onClick={() => {
                      setCreatingGameId(game.id)
                      setCustomName(`${game.away.abbr} @ ${game.home.abbr}`)
                    }}
                    className="rounded-md px-3 py-1.5 text-xs font-bold transition"
                    style={{ background: 'var(--db-gradient-primary)', color: '#fff', border: 'none', fontFamily: 'var(--db-font-ui)', boxShadow: '0 2px 8px rgba(255,107,53,0.3)', transition: 'opacity 100ms ease' }}
                    onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.85' }}
                    onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                  >
                    Create Room
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {creatingGameId && (
        <div className="modal-overlay fixed inset-0 z-30 flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="Create room" style={{ background: 'var(--db-bg-overlay)' }} onClick={closeCreateModal}>
          <div
            ref={createTrapRef}
            className="modal-panel-in w-full max-w-md p-6"
            style={{ background: 'var(--db-bg-surface)', border: '1px solid var(--db-border-default)', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: 'var(--db-text-primary)' }}>
              Create Room
            </h2>
            <p className="mt-1 text-xs" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-ghost)' }}>
              ESPN Game ID:{' '}
              <span style={{ fontFamily: 'var(--db-font-mono)', color: 'var(--db-text-secondary)' }}>{creatingGameId}</span>
            </p>

            {createError && (
              <div
                className="mt-3 rounded-md px-3 py-2 text-sm"
                style={{
                  background: 'rgba(255,45,45,0.08)',
                  border: '1px solid rgba(255,45,45,0.3)',
                  color: 'var(--db-live)',
                }}
              >
                {createError}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault()
                const game = games.find((g) => g.id === creatingGameId)
                if (game) handleCreateRoom(game)
              }}
              className="mt-4 space-y-4"
            >
              <div>
                <label
                  htmlFor="room-name"
                  className="mb-1 block text-xs font-medium uppercase tracking-wide"
                  style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--db-text-ghost)' }}
                >
                  Room name
                </label>
                <input
                  id="room-name"
                  type="text"
                  required
                  minLength={3}
                  maxLength={50}
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full rounded-md px-3 py-2 text-sm outline-none transition"
                  style={{
                    background: 'var(--db-bg-elevated)',
                    border: '1px solid var(--db-border-default)',
                    color: 'var(--db-text-primary)',
                    fontFamily: 'var(--db-font-ui)',
                    transition: 'border-color 120ms ease',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--db-primary)' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--db-border-default)' }}
                  placeholder="My Bingo Room"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition"
                  style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)', background: 'var(--db-bg-elevated)', border: '1px solid var(--db-border-default)', borderRadius: 6, transition: 'background 100ms, color 100ms' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-md px-4 py-1.5 text-xs font-bold transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ background: 'var(--db-gradient-primary)', color: '#fff', border: 'none', borderRadius: 6, fontFamily: 'var(--db-font-ui)', boxShadow: '0 2px 8px rgba(255,107,53,0.3)', transition: 'opacity 100ms ease' }}
                  onMouseEnter={(e) => { if (!createLoading) e.currentTarget.style.opacity = '0.9' }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
                >
                  {createLoading ? 'Creating…' : 'Create & Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function TeamRow({ team, showScore }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        {team.logo && (
          <img
            src={team.logo}
            alt={team.abbr}
            loading="lazy"
            className="h-7 w-7 object-contain"
          />
        )}
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--db-text-primary)' }}>{team.name}</p>
          <p className="text-[10px] uppercase tracking-wide" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-ghost)' }}>
            {team.abbr}
          </p>
        </div>
      </div>
      {showScore && (
        <span className="text-lg font-bold tabular-nums" style={{ color: 'var(--db-text-primary)' }}>
          {team.score}
        </span>
      )}
    </div>
  )
}

export default GameBrowserPage
