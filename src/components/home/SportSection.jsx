import GameCard from './GameCard.jsx'
import HorizontalSlider from '../ui/HorizontalSlider.jsx'
import MobileGameRow from './MobileGameRow.jsx'

const SKELETON_COUNT = 3

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Use Pacific midnight as the day boundary so games are bucketed by their
// calendar date in PT regardless of the viewer's local timezone.
function pacificDateStr(d) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(d)
}
function todayPacific() { return pacificDateStr(new Date()) }
function tomorrowPacific() {
  return pacificDateStr(new Date(Date.now() + 86_400_000))
}
function getDayLabel(startsAt) {
  if (!startsAt) return 'today'
  const gameDate = pacificDateStr(new Date(startsAt))
  const today = todayPacific()
  const tomorrow = tomorrowPacific()
  if (gameDate === today) return 'today'
  if (gameDate === tomorrow) return 'tomorrow'
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
        borderRight: '1px solid #1a1a2e',
        marginRight: 4,
      }}
    >
      <span
        style={{
          fontFamily: 'var(--db-font-mono)',
          fontSize: 10,
          fontWeight: 800,
          color: '#555577',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
      {sub && (
        <span
          style={{
            fontFamily: 'var(--db-font-mono)',
            fontSize: 9,
            color: '#3a3a55',
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

// ---------------------------------------------------------------------------
// Mobile: vertical list with day dividers (mobile-only, hidden md:block)
// ---------------------------------------------------------------------------

function MobileGameList({ games, joinedRoomIds, joiningRoomId, onJoin, onContinue }) {
  const byStartTime     = (a, b) => new Date(a.starts_at) - new Date(b.starts_at)
  const byStartTimeDesc = (a, b) => new Date(b.starts_at) - new Date(a.starts_at)

  const live         = games.filter((g) => g.status === 'live').sort(byStartTime)
  const todayLobby   = games.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'today').sort(byStartTime)
  const tomorrowLobby = games.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'tomorrow').sort(byStartTime)
  const futureLobby  = games.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'future').sort(byStartTime)
  const finished     = games.filter((g) => g.status === 'finished').sort(byStartTimeDesc)

  const Divider = ({ label }) => (
    <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, fontWeight: 700, color: '#3a3a55', letterSpacing: '0.12em', textTransform: 'uppercase', padding: '6px 0 2px' }}>
      {label}
    </div>
  )

  const Rows = ({ list }) => list.map((room) => (
    <MobileGameRow
      key={room.id}
      room={room}
      isJoined={joinedRoomIds.has(room.id)}
      joining={joiningRoomId === room.id}
      onJoin={onJoin}
      onContinue={onContinue}
    />
  ))

  if (games.length === 0) {
    return (
      <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', padding: '12px 0' }}>
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
      {finished.length > 0 && <><Divider label="RESULTS" /><Rows list={finished} /></>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Desktop: horizontal scroll of GameCards
// ---------------------------------------------------------------------------

function SliderWithDays({ games, joinedRoomIds, joiningRoomId, onJoin, onContinue }) {
  const byStartTime     = (a, b) => new Date(a.starts_at) - new Date(b.starts_at)
  const byStartTimeDesc = (a, b) => new Date(b.starts_at) - new Date(a.starts_at)

  const joinable = games.filter((g) => g.status === 'live' || g.status === 'lobby')
  const finished = games.filter((g) => g.status === 'finished')

  const liveGames     = joinable.filter((g) => g.status === 'live').sort(byStartTime)
  const todayLobby    = joinable.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'today').sort(byStartTime)
  const tomorrowLobby = joinable.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'tomorrow').sort(byStartTime)
  const futureLobby   = joinable.filter((g) => g.status === 'lobby' && getDayLabel(g.starts_at) === 'future').sort(byStartTime)
  const recentFinished = finished.sort(byStartTimeDesc)

  const todayDateStr    = fmtDate(todayPacific())
  const tomorrowDateStr = fmtDate(tomorrowPacific())

  const hasMultipleDays = tomorrowLobby.length > 0 || futureLobby.length > 0
  const hasFinished     = recentFinished.length > 0

  return (
    <HorizontalSlider>
      {/* LIVE — always first */}
      {liveGames.length > 0 && (
        <GameCardItems
          games={liveGames}
          joinedRoomIds={joinedRoomIds}
          joiningRoomId={joiningRoomId}
          onJoin={onJoin}
          onContinue={onContinue}
        />
      )}

      {/* TODAY's lobby */}
      {todayLobby.length > 0 && (
        <>
          {(liveGames.length > 0 || hasMultipleDays) && (
            <DaySeparator label="TODAY" sub={todayDateStr} />
          )}
          <GameCardItems
            games={todayLobby}
            joinedRoomIds={joinedRoomIds}
            joiningRoomId={joiningRoomId}
            onJoin={onJoin}
            onContinue={onContinue}
          />
        </>
      )}

      {/* TOMORROW's lobby */}
      {tomorrowLobby.length > 0 && (
        <>
          <DaySeparator label="TOMORROW" sub={tomorrowDateStr} />
          <GameCardItems
            games={tomorrowLobby}
            joinedRoomIds={joinedRoomIds}
            joiningRoomId={joiningRoomId}
            onJoin={onJoin}
            onContinue={onContinue}
          />
        </>
      )}

      {/* FUTURE lobby */}
      {futureLobby.length > 0 && (
        <>
          <DaySeparator
            label="UPCOMING"
            sub={fmtDate(pacificDateStr(new Date(futureLobby[0].starts_at)))}
          />
          <GameCardItems
            games={futureLobby}
            joinedRoomIds={joinedRoomIds}
            joiningRoomId={joiningRoomId}
            onJoin={onJoin}
            onContinue={onContinue}
          />
        </>
      )}

      {/* MY RESULTS — user's finished games only */}
      {hasFinished && (
        <>
          <DaySeparator
            label="MY RESULTS"
            sub={`${recentFinished.length} game${recentFinished.length === 1 ? '' : 's'}`}
          />
          <GameCardItems
            games={recentFinished}
            joinedRoomIds={joinedRoomIds}
            joiningRoomId={joiningRoomId}
            onJoin={onJoin}
            onContinue={onContinue}
          />
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
            style={{ border: '1px dashed #2a2a44', background: 'rgba(0,0,0,0.015)' }}
          >
            <p className="text-sm" style={{ color: '#555577' }}>No games available. Check back later!</p>
          </div>
        ) : !hasUpcoming && games.length > 0 ? (
          <>
            <div className="mb-3 px-1">
              <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577' }}>
                No upcoming games right now — showing your recent results.
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
      </div>

      {/* ── Mobile content (vertical game rows) ── */}
      <div className="block md:hidden">
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <div key={i} style={{ height: 52, borderRadius: 6, background: '#12121e' }} />
            ))}
          </div>
        ) : (
          <MobileGameList
            games={games}
            joinedRoomIds={joinedRoomIds}
            joiningRoomId={joiningRoomId}
            onJoin={onJoin}
            onContinue={onContinue}
          />
        )}
      </div>
    </section>
  )
}
