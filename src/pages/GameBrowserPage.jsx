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
              color: '#2D2A26',
              lineHeight: 1,
              letterSpacing: '0.02em',
            }}
          >
            Tonight&apos;s NBA Games
          </h1>
          <p className="mt-2 text-sm" style={{ color: '#5C5752' }}>
            Pick a game to create a bingo room.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-80"
          style={{
            background: '#E3E0DC',
            color: '#5C5752',
            border: '1px solid #D5D0CA',
          }}
        >
          ← Back to Lobby
        </button>
      </div>

      {error && (
        <div
          className="rounded-md px-3 py-2 text-sm"
          style={{
            background: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.3)',
            color: '#DC2626',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex min-h-[200px] items-center justify-center text-sm" style={{ color: '#9A9490' }}>
          Loading games from ESPN…
        </div>
      ) : games.length === 0 ? (
        <div className="flex min-h-[200px] flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm" style={{ color: '#5C5752' }}>No NBA games scheduled today.</p>
          <p className="text-xs" style={{ color: '#9A9490' }}>Check back on a game day.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => (
            <div
              key={game.id}
              className="relative flex flex-col justify-between rounded-xl p-5"
              style={{ background: '#F5F3F0', border: '1px solid #D5D0CA' }}
            >
              {game.isLive && (
                <span
                  className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
                  style={{ background: 'rgba(220,38,38,0.15)', color: '#DC2626', border: '1px solid rgba(220,38,38,0.3)' }}
                >
                  <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
                  Live
                </span>
              )}

              {game.isFinished && (
                <span
                  className="absolute right-3 top-3 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ background: '#E3E0DC', color: '#9A9490', border: '1px solid #B8B2AA' }}
                >
                  Final
                </span>
              )}

              <div className="space-y-3">
                <TeamRow team={game.away} showScore={game.isLive || game.isFinished} />
                <div style={{ height: 1, background: '#D5D0CA' }} />
                <TeamRow team={game.home} showScore={game.isLive || game.isFinished} />
              </div>

              <div className="mt-4 flex items-center justify-between">
                <div className="text-xs" style={{ color: '#9A9490' }}>
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
                    className="rounded-md px-3 py-1.5 text-xs font-bold transition hover:bg-[#F0705A]"
                    style={{ background: '#E44D2E', color: '#FFF' }}
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
            className="w-full max-w-md rounded-2xl p-6 shadow-2xl"
            style={{ background: '#F5F3F0', border: '1px solid #D5D0CA' }}
          >
            <h2 className="text-lg font-semibold tracking-tight" style={{ color: '#2D2A26' }}>
              Create Room
            </h2>
            <p className="mt-1 text-xs" style={{ color: '#9A9490' }}>
              ESPN Game ID:{' '}
              <span className="font-mono" style={{ color: '#5C5752' }}>{creatingGameId}</span>
            </p>

            {createError && (
              <div
                className="mt-3 rounded-md px-3 py-2 text-sm"
                style={{
                  background: 'rgba(220,38,38,0.08)',
                  border: '1px solid rgba(220,38,38,0.3)',
                  color: '#DC2626',
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
                  style={{ color: '#9A9490' }}
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
                    background: '#F5F3F0',
                    border: '1px solid #D5D0CA',
                    color: '#2D2A26',
                  }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = '#E44D2E' }}
                  onBlur={(e) => { e.currentTarget.style.borderColor = '#D5D0CA' }}
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
                  style={{ color: '#5C5752', background: 'transparent', border: '1px solid #D5D0CA' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#E3E0DC' }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-md px-4 py-1.5 text-xs font-bold transition hover:bg-[#F0705A] disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ background: '#E44D2E', color: '#FFF' }}
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
          <p className="text-sm font-medium" style={{ color: '#2D2A26' }}>{team.name}</p>
          <p className="text-[10px] uppercase tracking-wide" style={{ color: '#9A9490' }}>
            {team.abbr}
          </p>
        </div>
      </div>
      {showScore && (
        <span className="text-lg font-bold tabular-nums" style={{ color: '#2D2A26' }}>
          {team.score}
        </span>
      )}
    </div>
  )
}

export default GameBrowserPage
