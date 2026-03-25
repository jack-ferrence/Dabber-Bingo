import { useEffect } from 'react'
import { useProfile } from '../../hooks/useProfile.js'

const ENTRY_COST = 10

export default function JoinAllConfirmModal({ sport, rooms, onConfirm, onClose, joining }) {
  const { dobsBalance } = useProfile()
  const isNcaa = sport === 'ncaa'
  const sportLabel = isNcaa ? 'NCAA' : 'NBA'
  const sportIcon = isNcaa ? '🏆' : '🏀'
  const totalCost = isNcaa ? 0 : rooms.length * ENTRY_COST
  const balanceLoading = dobsBalance === null
  const canAfford = balanceLoading ? false : (isNcaa || dobsBalance >= totalCost)
  const balanceAfter = isNcaa ? dobsBalance : (dobsBalance ?? 0) - totalCost

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(12,12,20,0.85)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 8, maxWidth: 400, width: 'calc(100% - 32px)', padding: 28, position: 'relative' }}>
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#555577', cursor: 'pointer', fontFamily: 'var(--db-font-mono)', fontSize: 16, lineHeight: 1, padding: 4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0f0' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
        >✕</button>

        {/* Icon */}
        <div style={{ fontSize: 28, marginBottom: 12 }}>{sportIcon}</div>

        {/* Title */}
        <h2 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 800, color: '#e0e0f0', margin: '0 0 6px', letterSpacing: '0.06em' }}>
          JOIN ALL {sportLabel} GAMES
        </h2>

        {/* Subtitle */}
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: '#8888aa', margin: '0 0 14px', letterSpacing: '0.04em' }}>
          {rooms.length} game{rooms.length === 1 ? '' : 's'}
        </p>

        {/* Game list */}
        <div
          className="scrollbar-thin"
          style={{
            maxHeight: 180,
            overflowY: 'auto',
            marginBottom: 14,
            scrollbarWidth: 'thin',
          }}
        >
          {rooms.map((room) => (
            <div
              key={room.id}
              style={{
                fontFamily: 'var(--db-font-mono)',
                fontSize: 11,
                color: '#8888aa',
                background: '#1a1a2e',
                padding: '6px 12px',
                borderRadius: 3,
                marginBottom: 3,
              }}
            >
              {room.name ?? room.id}
            </div>
          ))}
        </div>

        {/* Cost info box */}
        <div style={{ background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 4, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', letterSpacing: '0.06em' }}>TOTAL COST</span>
            {isNcaa ? (
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: '#22c55e', letterSpacing: '0.04em' }}>FREE</span>
            ) : (
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: '#ff6b35', letterSpacing: '0.04em' }}>{totalCost} ◈</span>
            )}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: isNcaa ? 0 : 8 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', letterSpacing: '0.06em' }}>YOUR BALANCE</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: balanceLoading ? '#555577' : '#e0e0f0', letterSpacing: '0.04em' }}>
              {balanceLoading ? '…' : `${dobsBalance} ◈`}
            </span>
          </div>
          {!isNcaa && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', letterSpacing: '0.06em' }}>BALANCE AFTER</span>
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: balanceAfter >= 0 ? '#e0e0f0' : '#ff2d2d', letterSpacing: '0.04em' }}>
                {balanceLoading ? '…' : `${balanceAfter} ◈`}
              </span>
            </div>
          )}
        </div>

        {/* Insufficient funds warning */}
        {!canAfford && !balanceLoading && !isNcaa && (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#ff2d2d', margin: '0 0 14px', letterSpacing: '0.04em' }}>
            ✕ Not enough Dobs. You need {totalCost} but only have {dobsBalance}.
          </p>
        )}

        {/* Confirm button */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canAfford || joining}
          style={{
            width: '100%',
            background: canAfford && !joining ? '#ff6b35' : '#2a2a44',
            color: canAfford && !joining ? '#0c0c14' : '#555577',
            border: 'none',
            borderRadius: 4,
            fontFamily: 'var(--db-font-mono)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.08em',
            padding: '10px 0',
            cursor: canAfford && !joining ? 'pointer' : 'not-allowed',
            marginBottom: 8,
            transition: 'background 100ms ease',
          }}
          onMouseEnter={(e) => { if (canAfford && !joining) e.currentTarget.style.background = '#ff8855' }}
          onMouseLeave={(e) => { if (canAfford && !joining) e.currentTarget.style.background = '#ff6b35' }}
        >
          {joining
            ? `JOINING ${rooms.length} GAME${rooms.length === 1 ? '' : 'S'}…`
            : isNcaa ? `JOIN ALL — FREE` : `JOIN ALL — ${totalCost} ◈`}
        </button>

        {/* Cancel button */}
        <button
          type="button"
          onClick={onClose}
          style={{ width: '100%', background: 'none', border: '1px solid #2a2a44', borderRadius: 4, fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', padding: '8px 0', cursor: 'pointer', letterSpacing: '0.06em' }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#8888aa'; e.currentTarget.style.borderColor = '#3a3a55' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#555577'; e.currentTarget.style.borderColor = '#2a2a44' }}
        >
          CANCEL
        </button>
      </div>
    </div>
  )
}
