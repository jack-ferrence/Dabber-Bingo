import { useFocusTrap } from '../../hooks/useFocusTrap.js'

const TIER_COLORS = {
  1: 'var(--db-success)',
  2: '#eab308',
  3: '#ef4444',
}

function MiniSquare({ square, index }) {
  if (!square) return <div style={{ background: 'var(--db-bg-elevated)', borderRadius: 3, aspectRatio: '1' }} />

  const isFree   = index === 12 || square.stat_type === 'free'
  const isMarked = isFree || square.marked === true || square.marked === 'true'
  const tierColor = TIER_COLORS[square.tier] ?? 'var(--db-text-ghost)'

  const parts = (square.display_text ?? '').split(' ')
  const namePart = parts[0] ?? ''
  const statPart = parts.slice(1).join(' ')

  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '1',
        borderRadius: 3,
        overflow: 'hidden',
        background: isMarked ? 'rgba(255,107,53,0.12)' : 'var(--db-bg-elevated)',
        border: `1px solid ${isMarked ? 'rgba(255,107,53,0.4)' : 'var(--db-border-default)'}`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2px 3px',
        gap: 1,
      }}
    >
      {/* Tier dot */}
      {!isFree && (
        <div style={{
          position: 'absolute',
          top: 2,
          left: 2,
          width: 4,
          height: 4,
          borderRadius: '50%',
          background: tierColor,
          opacity: 0.7,
        }} />
      )}

      {isFree ? (
        <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--db-primary)', fontFamily: 'var(--db-font-display)', letterSpacing: '0.05em' }}>
          FREE
        </span>
      ) : (
        <>
          <span style={{ fontSize: 7, color: 'var(--db-text-ghost)', fontFamily: 'var(--db-font-ui)', lineHeight: 1, textAlign: 'center', overflow: 'hidden', maxWidth: '100%', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {namePart}
          </span>
          <span style={{ fontSize: 7, fontWeight: 700, color: isMarked ? 'var(--db-primary)' : 'var(--db-text-secondary)', fontFamily: 'var(--db-font-mono)', lineHeight: 1, textAlign: 'center', overflow: 'hidden', maxWidth: '100%', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {statPart}
          </span>
        </>
      )}
    </div>
  )
}

export default function CardViewerModal({
  isOpen,
  onClose,
  playerName,
  squares,
  squaresMarked = 0,
  linesCompleted = 0,
  loading,
}) {
  const trapRef = useFocusTrap(isOpen, { onEscape: onClose })

  if (!isOpen) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${playerName}'s bingo card`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--db-bg-overlay)',
        backdropFilter: 'blur(4px)',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={trapRef}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 'min(480px, calc(100vw - 32px))',
          background: 'var(--db-bg-surface)',
          border: '1px solid var(--db-border-default)',
          borderRadius: 14,
          padding: 20,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 14, fontWeight: 600, color: 'var(--db-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 'calc(100% - 40px)' }}>
            {playerName}&apos;s Card
          </span>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--db-text-muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '12px', minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, borderRadius: 4, transition: 'color 120ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-muted)' }}
            aria-label="Close"
          >✕</button>
        </div>

        {/* Body */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)' }}>Loading card...</span>
          </div>
        ) : !squares?.length ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160 }}>
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-muted)' }}>Card not available</span>
          </div>
        ) : (
          <>
            {/* 5×5 grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 3 }}>
              {Array.from({ length: 25 }, (_, i) => (
                <MiniSquare key={i} square={squares[i]} index={i} />
              ))}
            </div>

            {/* Footer stats */}
            <p style={{ marginTop: 12, fontFamily: 'var(--db-font-ui)', fontSize: 11, color: 'var(--db-text-muted)', textAlign: 'center' }}>
              {squaresMarked}/25 marked · {linesCompleted} line{linesCompleted === 1 ? '' : 's'}
            </p>
          </>
        )}
      </div>
    </div>
  )
}
