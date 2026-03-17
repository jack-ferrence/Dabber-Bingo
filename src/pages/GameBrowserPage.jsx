import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth.jsx'
import { useCountdown } from '../hooks/useCountdown.js'

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
              color: '#e0e0f0',
              lineHeight: 1,
              letterSpacing: '0.02em',
            }}
          >
            Tonight&apos;s NBA Games
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#8888aa' }}>
            Pick a game to create a bingo room.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
          style={{
            background: '#2a2a44',
            color: '#8888aa',
            border: '1px solid #2a2a44',
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
            color: '#ff2d2d',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-sm" style={{ color: '#555577' }}>
          Loading games from ESPN…
        </div>
      ) : games.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm" style={{ color: '#8888aa' }}>No NBA games scheduled today.</p>
          <p className="text-xs" style={{ color: '#555577' }}>Check back on a game day.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <div
              key={game.id}
              className="relative flex flex-col justify-between rounded-xl p-5"
              style={{ background: '#1a1a2e', border: '1px solid #2a2a44' }}
            >
              {game.isLive && (
                <span
                  className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(255,45,45,0.15)', color: '#ff2d2d', border: '1px solid rgba(255,45,45,0.3)' }}
                >
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Live
                </span>
              )}

              {game.isFinished && (
                <span
                  className="absolute right-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: '#2a2a44', color: '#555577', border: '1px solid #555577' }}
                >
                  Final
                </span>
              )}

              <div className="space-y-3">
                <TeamRow team={game.away} showScore={game.isLive || game.isFinished} />
                <div style={{ height: 1, background: '#2a2a44' }} />
                <TeamRow team={game.home} showScore={game.isLive || game.isFinished} />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs" style={{ color: '#555577' }}>
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
                    className="rounded-md px-3 py-1.5 text-xs font-bold transition hover:bg-[#ff8855]"
                    style={{ background: '#ff6b35', color: '#0c0c14' }}
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
        <div className="fixed inset-0 z-30 flex items-center justify-center px-4" style={{ background: 'rgba(0,0,0,0.5)' }}>
          <div
            className="w-full max-w-md p-6"
            style={{ background: '#1a1a2e', border: '1px solid #2a2a44' }}
          >
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: '#e0e0f0' }}>
              Create Room
            </h2>
            <p className="mt-1 text-xs" style={{ color: '#555577' }}>
              ESPN Game ID:{' '}
              <span className="font-mono" style={{ color: '#8888aa' }}>{creatingGameId}</span>
            </p>

            {createError && (
              <div
                className="mt-3 rounded-md px-3 py-2 text-sm"
                style={{
                  background: 'rgba(255,45,45,0.08)',
                  border: '1px solid rgba(255,45,45,0.3)',
                  color: '#ff2d2d',
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
                  style={{ color: '#555577' }}
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
                    background: '#1a1a2e',
                    border: '1px solid #2a2a44',
                    color: '#e0e0f0',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#ff6b35' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#2a2a44' }}
                  placeholder="My Bingo Room"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!createLoading) {
                      setCreatingGameId(null)
                      setCustomName('')
                      setCreateError('')
                    }
                  }}
                  className="rounded-md px-3 py-1.5 text-xs font-medium transition"
                  style={{ color: '#8888aa', background: 'transparent', border: '1px solid #2a2a44' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#2a2a44' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-md px-4 py-1.5 text-xs font-bold transition hover:bg-[#ff8855] disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ background: '#ff6b35', color: '#0c0c14' }}
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
            className="h-7 w-7 object-contain"
          />
        )}
        <div>
          <p className="text-sm font-medium" style={{ color: '#e0e0f0' }}>{team.name}</p>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: '#555577' }}>
            {team.abbr}
          </p>
        </div>
      </div>
      {showScore && (
        <span className="text-lg font-bold tabular-nums" style={{ color: '#e0e0f0' }}>
          {team.score}
        </span>
      )}
    </div>
  )
}

export default GameBrowserPage
