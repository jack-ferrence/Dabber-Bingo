function StatusBadge({ status }) {
  if (status === 'live') {
    return (
      <span
        className="inline-flex items-center gap-1.5"
        style={{
          background: 'rgba(255,45,45,0.10)',
          border: '1px solid rgba(255,45,45,0.22)',
          color: '#ff2d2d',
          fontFamily: 'var(--db-font-display)',
          fontSize: 9.5,
          letterSpacing: '0.10em',
          padding: '3px 8px',
          borderRadius: 5,
        }}
      >
        <span
          style={{
            width: 5,
            height: 5,
            borderRadius: '50%',
            background: '#ff2d2d',
            display: 'inline-block',
            animation: 'pulse-live 1.4s ease-in-out infinite',
            flexShrink: 0,
          }}
        />
        LIVE
      </span>
    )
  }
  if (status === 'lobby') {
    return (
      <span
        style={{
          background: 'rgba(255,107,53,0.08)',
          border: '1px solid rgba(255,107,53,0.18)',
          color: '#ff6b35',
          fontFamily: 'var(--db-font-display)',
          fontSize: 9.5,
          letterSpacing: '0.10em',
          padding: '3px 8px',
          borderRadius: 5,
          display: 'inline-block',
        }}
      >
        LOBBY
      </span>
    )
  }
  return (
    <span
      style={{
        background: 'var(--db-bg-hover)',
        border: '1px solid var(--db-border-default)',
        color: 'var(--db-text-ghost)',
        fontFamily: 'var(--db-font-display)',
        fontSize: 9.5,
        letterSpacing: '0.10em',
        padding: '3px 8px',
        borderRadius: 5,
        display: 'inline-block',
      }}
    >
      FINAL
    </span>
  )
}

export default function RoomCard({ room, onJoin, onContinue, isMyRoom, joining }) {
  const isLive = room.status === 'live'
  const isLobby = room.status === 'lobby'
  const isFinished = room.status === 'finished'

  const accentColor = isMyRoom ? '#22c55e' : isLive ? '#ff2d2d' : '#ff6b35'
  const showAccent = isLive || isLobby || isMyRoom

  return (
    <div
      className="flex flex-col justify-between rounded-xl transition-all duration-200"
      style={{
        background: 'var(--db-bg-elevated)',
        border: '1px solid var(--db-border-subtle)',
        borderLeft: showAccent ? `3px solid ${accentColor}` : '1px solid var(--db-border-subtle)',
        padding: showAccent ? '16px 20px 16px 18px' : '16px 20px',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--db-border-active)'
        e.currentTarget.style.boxShadow = isLive
          ? '0 4px 20px rgba(255,45,45,0.12)'
          : '0 4px 20px rgba(0,0,0,0.15)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--db-border-subtle)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3
            className="truncate font-semibold"
            style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-primary)', fontSize: 14, lineHeight: 1.3 }}
          >
            {room.name}
          </h3>
        </div>
        <StatusBadge status={room.status} />
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-1">
          {isMyRoom ? (
            <span
              style={{
                background: 'rgba(34,197,94,0.10)',
                border: '1px solid rgba(34,197,94,0.25)',
                color: '#22c55e',
                fontFamily: 'var(--db-font-display)',
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.08em',
                padding: '3px 8px',
                borderRadius: 5,
              }}
            >
              ✓ YOU'RE IN
            </span>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--db-text-ghost)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)' }}>
                <span style={{ color: 'var(--db-text-secondary)', fontWeight: 600 }}>
                  {room.participant_count ?? 0}
                </span>{' '}
                {(room.participant_count ?? 0) === 1 ? 'player' : 'players'}
              </span>
            </>
          )}
        </div>

        {!isFinished && (
          isMyRoom ? (
            <button
              type="button"
              onClick={() => onContinue(room.id)}
              className="inline-flex items-center justify-center rounded-lg text-sm font-bold transition-all"
              style={{
                border: '1px solid rgba(255,107,53,0.30)',
                color: '#ff6b35',
                background: 'rgba(255,107,53,0.06)',
                fontFamily: 'var(--db-font-ui)',
                padding: '6px 16px',
                fontSize: 13,
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.12)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,107,53,0.06)' }}
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onJoin(room.id)}
              disabled={joining}
              className="inline-flex items-center justify-center rounded-lg font-bold transition-all disabled:cursor-not-allowed disabled:opacity-55"
              style={{
                background: 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                color: '#fff',
                fontFamily: 'var(--db-font-ui)',
                padding: '6px 16px',
                fontSize: 13,
                border: 'none',
                cursor: joining ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 10px rgba(255,107,53,0.3)',
                transition: 'opacity 120ms ease',
              }}
              onMouseEnter={(e) => { if (!joining) e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
            >
              {joining ? 'Joining…' : 'Join'}
            </button>
          )
        )}
      </div>
    </div>
  )
}
