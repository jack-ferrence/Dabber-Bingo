import GameCard from './GameCard.jsx'
import HorizontalSlider from '../ui/HorizontalSlider.jsx'
import MobileGameRow from './MobileGameRow.jsx'

const SKELETON_COUNT = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function localDateStr(d) {
  const dt = new Date(d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function todayLocal() { return localDateStr(new Date()) }
function tomorrowLocal() { return localDateStr(new Date(Date.now() + 86_400_000)) }
function getDayLabel(startsAt) {
  if (!startsAt) return 'today'
  const gameDate = localDateStr(new Date(startsAt))
  if (gameDate === todayLocal()) return 'today'
  if (gameDate === tomorrowLocal()) return 'tomorrow'
  return 'future'
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
        padding: '0 16px',
        minHeight: 100,
        borderRight: '1px solid rgba(255,255,255,0.05)',
        marginRight: 4,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--db-font-display)',
          fontSize: 11,
          color: 'rgba(255,255,255,0.4)',
          letterSpacing: '0.1em',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: 'var(--db-font-ui)',
            fontSize: 10,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.35)',
            marginTop: 3,
            whiteSpace: 'nowrap',
          }}
        >
          {sub}
        </span>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Render a labelled set of cards inside the slider
// ---------------------------------------------------------------------------

function GameCardItems({ games, onOpenGame, finishedRanks, myRoomIds }) {
  return games.map((game) => (
    <div key={game.id} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
      <GameCard
        game={game}
        onOpenGame={onOpenGame}
        rank={finishedRanks?.[game.id] ?? 0}
        isPlaying={myRoomIds?.has(game.id) ?? false}
      />
    </div>
  ))
}

// ---------------------------------------------------------------------------
// Mobile: vertical list with day dividers (mobile-only, hidden md:block)
// ---------------------------------------------------------------------------

function MobileGameList({ games, onOpenGame, myRoomIds }) {
  const byStartTime     = (a, b) => new Date(a.starts_at) - new Date(b.starts_at)
  const byStartTimeDesc = (a, b) => new Date(b.starts_at) - new Date(a.starts_at)

  const live         = games.filter((g) => g.status === 'live').sort(byStartTime)
  const todayLobby   = games.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'today').sort(byStartTime)
  const tomorrowLobby = games.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'tomorrow').sort(byStartTime)
  const futureLobby  = games.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'future').sort(byStartTime)
  const finished     = games.filter((g) => g.status === 'finished').sort(byStartTimeDesc)

  const Divider = ({ label }) => (
    <div style={{ fontFamily: 'var(--db-font-display)', fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', padding: '6px 0 2px' }}>
      {label}
    </div>
  )

  const Rows = ({ list }) => list.map((room) => (
    <MobileGameRow
      key={room.id}
      room={room}
      onOpenGame={onOpenGame}
      isMyRoom={myRoomIds?.has(room.id) ?? false}
    />
  ))

  if (games.length === 0) {
    return (
      <div style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,0.4)', padding: '12px 0' }}>
        No games available. Check back later!
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {live.length > 0 && <><Divider label="LIVE" /><Rows list={live} /></>}
      {todayLobby.length > 0 && <><Divider label="TODAY" /><Rows list={todayLobby} /></>}
      {tomorrowLobby.length > 0 && <><Divider label="TOMORROW" /><Rows list={tomorrowLobby} /></>}
      {futureLobby.length > 0 && <><Divider label="UPCOMING" /><Rows list={futureLobby} /></>}
      {finished.length > 0 && <><Divider label="FINAL" /><Rows list={finished} /></>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop: horizontal scroll of GameCards
// ---------------------------------------------------------------------------

function SliderWithDays({ games, onOpenGame, finishedRanks, myRoomIds }) {
  const byStartTime     = (a, b) => new Date(a.starts_at) - new Date(b.starts_at)
  const byStartTimeDesc = (a, b) => new Date(b.starts_at) - new Date(a.starts_at)

  const joinable = games.filter((g) => g.status === 'live' || g.status === 'lobby')
  const finished = games.filter((g) => g.status === 'finished')

  const liveGames     = joinable.filter((g) => g.status === 'live').sort(byStartTime)
  const todayLobby    = joinable.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'today').sort(byStartTime)
  const tomorrowLobby = joinable.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'tomorrow').sort(byStartTime)
  const futureLobby   = joinable.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'future').sort(byStartTime)
  const recentFinished = finished.sort(byStartTimeDesc)

  const todayDateStr    = fmtDate(todayLocal())
  const tomorrowDateStr = fmtDate(tomorrowLocal())

  const hasMultipleDays = tomorrowLobby.length > 0 || futureLobby.length > 0
  const hasFinished     = recentFinished.length > 0

  return (
    <HorizontalSlider>
      {/* LIVE — always first */}
      {liveGames.length > 0 && (
        <GameCardItems games={liveGames} onOpenGame={onOpenGame} finishedRanks={finishedRanks} myRoomIds={myRoomIds} />
      )}

      {/* TODAY's lobby */}
      {todayLobby.length > 0 && (
        <>
          {(liveGames.length > 0 || hasMultipleDays) && (
            <DaySeparator label="TODAY" sub={todayDateStr} />
          )}
          <GameCardItems games={todayLobby} onOpenGame={onOpenGame} finishedRanks={finishedRanks} myRoomIds={myRoomIds} />
        </>
      )}

      {/* TOMORROW's lobby */}
      {tomorrowLobby.length > 0 && (
        <>
          <DaySeparator label="TOMORROW" sub={tomorrowDateStr} />
          <GameCardItems games={tomorrowLobby} onOpenGame={onOpenGame} finishedRanks={finishedRanks} myRoomIds={myRoomIds} />
        </>
      )}

      {/* FUTURE lobby */}
      {futureLobby.length > 0 && (
        <>
          <DaySeparator
            label="UPCOMING"
            sub={fmtDate(localDateStr(new Date(futureLobby[0].starts_at)))}
          />
          <GameCardItems games={futureLobby} onOpenGame={onOpenGame} finishedRanks={finishedRanks} myRoomIds={myRoomIds} />
        </>
      )}

      {/* RECENTLY FINISHED — last */}
      {hasFinished && (
        <>
          <DaySeparator
            label="FINAL"
            sub={`${recentFinished.length} game${recentFinished.length === 1 ? '' : 's'}`}
          />
          <GameCardItems games={recentFinished} onOpenGame={onOpenGame} finishedRanks={finishedRanks} myRoomIds={myRoomIds} />
        </>
      )}

      {/* Empty state */}
      {joinable.length === 0 && !hasFinished && (
        <DaySeparator label="NO GAMES" sub="Check back later" />
      )}
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
  onOpenGame,
  finishedRanks,
  myRoomIds,
  style,
}) {
  const hasUpcoming = games.some((g) => g.status === 'live' || g.status === 'lobby')

  return (
    <section className="sport-section" style={style}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-1 mb-3 md:mb-5 px-1">
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
                fontFamily: 'var(--db-font-ui)',
                fontSize: 11,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.4)',
                background: 'rgba(255,255,255,0.06)',
                padding: '2px 8px',
                borderRadius: 10,
              }}
            >
              {games.length}
            </span>
          )}
        </div>
      </div>

      {/* ── Desktop content (horizontal scroll cards) ── */}
      <div className="hidden md:block">
        {loading ? (
          <div className="flex gap-4 overflow-x-scroll no-scrollbar pb-3" style={{ scrollSnapType: 'x mandatory' }}>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={i} className="skeleton-card" style={{ scrollSnapAlign: 'start' }} />
            ))}
          </div>
        ) : games.length === 0 ? (
          <div
            className="rounded-xl px-6 py-8 text-center"
            style={{ border: '1px dashed rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}
          >
            <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>No games available. Check back later!</p>
          </div>
        ) : !hasUpcoming && games.length > 0 ? (
          <>
            <div className="mb-3 px-1">
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.4)' }}>
                No upcoming games right now — showing recent results.
              </p>
            </div>
            <SliderWithDays games={games} onOpenGame={onOpenGame} finishedRanks={finishedRanks} myRoomIds={myRoomIds} />
          </>
        ) : (
          <SliderWithDays games={games} onOpenGame={onOpenGame} finishedRanks={finishedRanks} myRoomIds={myRoomIds} />
        )}
      </div>

      {/* ── Mobile content (vertical game rows) ── */}
      <div className="block md:hidden">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={i} style={{ height: 52, borderRadius: 8, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }} />
            ))}
          </div>
        ) : (
          <MobileGameList games={games} onOpenGame={onOpenGame} myRoomIds={myRoomIds} />
        )}
      </div>
    </section>
  )
}
