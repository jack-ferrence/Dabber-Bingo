import GameCard from './GameCard.jsx'
import HorizontalSlider from '../ui/HorizontalSlider.jsx'

const SKELETON_COUNT = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function todayUTC() {
  return new Date().toISOString().slice(0, 10)
}

function tomorrowUTC() {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function getDayLabel(startsAt) {
  if (!startsAt) return 'today'
  const gameDate = new Date(startsAt).toISOString().slice(0, 10)
  if (gameDate === tomorrowUTC()) return 'tomorrow'
  return 'today'
}

function fmtDate(isoDate) {
  try {
    const [year, month, day] = isoDate.split('-').map(Number)
    return new Date(year, month - 1, day)
      .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
      .toUpperCase()
  } catch {
    return isoDate
  }
}

// ---------------------------------------------------------------------------
// DaySeparator — inline flex item in the horizontal scroll row
// ---------------------------------------------------------------------------

function DaySeparator({ label, sub }) {
  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 20px',
        minHeight: 120,
        borderLeft: '1px solid #2a2a44',
        borderRight: '1px solid #2a2a44',
        marginRight: 8,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--db-font-mono)',
          fontSize: 12,
          fontWeight: 800,
          color: '#ff6b35',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--db-font-mono)',
          fontSize: 10,
          color: '#555577',
          marginTop: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {sub}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Render a labelled set of cards inside the slider
// ---------------------------------------------------------------------------

function GameCardItems({ games, joinedRoomIds, joiningRoomId, onJoin, onContinue }) {
  return games.map((game) => (
    <div key={game.id} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
      <GameCard
        game={game}
        isJoined={joinedRoomIds.has(game.id)}
        joining={joiningRoomId === game.id}
        onJoin={onJoin}
        onContinue={onContinue}
      />
    </div>
  ))
}

function SliderWithDays({ games, joinedRoomIds, joiningRoomId, onJoin, onContinue }) {
  const todayGames    = games.filter((g) => getDayLabel(g.starts_at) === 'today')
  const tomorrowGames = games.filter((g) => getDayLabel(g.starts_at) === 'tomorrow')

  const todayDateStr    = fmtDate(todayUTC())
  const tomorrowDateStr = fmtDate(tomorrowUTC())

  // Only show day labels when there's content from more than one day OR
  // when all games are tomorrow (so the user knows why they're not today)
  const showLabels = tomorrowGames.length > 0

  if (!showLabels) {
    // All games are today — no separators needed
    return (
      <HorizontalSlider>
        <GameCardItems
          games={games}
          joinedRoomIds={joinedRoomIds}
          joiningRoomId={joiningRoomId}
          onJoin={onJoin}
          onContinue={onContinue}
        />
      </HorizontalSlider>
    )
  }

  return (
    <HorizontalSlider>
      {/* TODAY section */}
      <DaySeparator label="TODAY" sub={todayGames.length === 0 ? 'NO GAMES' : todayDateStr} />
      {todayGames.length > 0 && (
        <GameCardItems
          games={todayGames}
          joinedRoomIds={joinedRoomIds}
          joiningRoomId={joiningRoomId}
          onJoin={onJoin}
          onContinue={onContinue}
        />
      )}

      {/* TOMORROW section */}
      <DaySeparator label="TOMORROW" sub={tomorrowDateStr} />
      <GameCardItems
        games={tomorrowGames}
        joinedRoomIds={joinedRoomIds}
        joiningRoomId={joiningRoomId}
        onJoin={onJoin}
        onContinue={onContinue}
      />
    </HorizontalSlider>
  )
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function SportSection({
  sport,
  label,
  games,
  loading,
  joinedRoomIds,
  joiningRoomId,
  onJoin,
  onContinue,
  style,
}) {
  const hasUpcoming = games.some((g) => g.status === 'live' || g.status === 'lobby')

  return (
    <section className="sport-section" style={style}>
      {/* Header */}
      <div className="flex items-center mb-5 px-1">
        <div className="flex items-center gap-3">
          <div style={{ width: 3, height: 30, background: '#ff6b35', borderRadius: 2, flexShrink: 0 }} />
          <h2
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 26,
              lineHeight: 1,
              letterSpacing: '0.04em',
              color: '#e0e0f0',
            }}
          >
            {label}
          </h2>
          {sport === 'ncaa' && (
            <span
              style={{
                background: 'rgba(34,197,94,0.12)',
                color: '#22c55e',
                border: '1px solid rgba(34,197,94,0.25)',
                fontFamily: 'var(--db-font-mono)',
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: '0.10em',
                textTransform: 'uppercase',
                borderRadius: 3,
                padding: '2px 6px',
                flexShrink: 0,
              }}
            >
              FREE ENTRY
            </span>
          )}
          {!loading && games.length > 0 && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#555577',
                background: '#2a2a44',
                padding: '2px 8px',
                borderRadius: 10,
                letterSpacing: '0.03em',
              }}
            >
              {games.length}
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex gap-4 overflow-x-scroll no-scrollbar pb-3" style={{ scrollSnapType: 'x mandatory' }}>
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <div key={i} className="skeleton-card" style={{ scrollSnapAlign: 'start' }} />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div
          className="rounded-xl px-6 py-8 text-center"
          style={{ border: '1px dashed #2a2a44', background: 'rgba(0,0,0,0.015)' }}
        >
          <p className="text-sm" style={{ color: '#555577' }}>No upcoming games. Check back tomorrow!</p>
        </div>
      ) : !hasUpcoming ? (
        <>
          <div className="mb-3 px-1">
            <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577' }}>
              No upcoming games right now — showing today's results below.
            </p>
          </div>
          <SliderWithDays
            games={games}
            joinedRoomIds={joinedRoomIds}
            joiningRoomId={joiningRoomId}
            onJoin={onJoin}
            onContinue={onContinue}
          />
        </>
      ) : (
        <SliderWithDays
          games={games}
          joinedRoomIds={joinedRoomIds}
          joiningRoomId={joiningRoomId}
          onJoin={onJoin}
          onContinue={onContinue}
        />
      )}
    </section>
  )
}
