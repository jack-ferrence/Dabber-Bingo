import GameCard from './GameCard.jsx'
import HorizontalSlider from '../ui/HorizontalSlider.jsx'

const SKELETON_COUNT = 3

export default function SportSection({
  label,
  games,
  loading,
  joinedRoomIds,
  joiningRoomId,
  onJoin,
  onContinue,
  style,
}) {
  return (
    <section className="sport-section" style={style}>
      {/* Header */}
      <div className="flex items-center mb-5 px-1">
        <div className="flex items-center gap-3">
          {/* Cinnabar left-bar accent */}
          <div
            style={{
              width: 3,
              height: 30,
              background: '#ff6b35',
              borderRadius: 2,
              flexShrink: 0,
            }}
          />
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

      {/* Horizontal slider */}
      {loading ? (
        <div
          className="flex gap-4 overflow-x-scroll no-scrollbar pb-3"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
            <div
              key={i}
              className="skeleton-card"
              style={{ scrollSnapAlign: 'start' }}
            />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div
          className="rounded-xl px-6 py-8 text-center"
          style={{
            border: '1px dashed #2a2a44',
            background: 'rgba(0,0,0,0.015)',
          }}
        >
          <p className="text-sm" style={{ color: '#555577' }}>No games scheduled today</p>
        </div>
      ) : (
        <HorizontalSlider>
          {games.map((game) => (
            <div key={game.id} style={{ scrollSnapAlign: 'start', flexShrink: 0 }}>
              <GameCard
                game={game}
                isJoined={joinedRoomIds.has(game.id)}
                joining={joiningRoomId === game.id}
                onJoin={onJoin}
                onContinue={onContinue}
              />
            </div>
          ))}
        </HorizontalSlider>
      )}
    </section>
  )
}
