import { useProfile } from '../../hooks/useProfile.js'

const ENTRY_COST = 10

function parseTeams(name) {
  const parts = (name ?? '').split(' vs ')
  return {
    away: parts[0]?.trim() || '---',
    home: parts[1]?.trim() || '---',
  }
}

export default function JoinConfirmModal({ room, onConfirm, onClose }) {
  const { dobsBalance: dabsBalance } = useProfile()
  const { away, home } = parseTeams(room.name)
  const balanceLoading = dabsBalance === null
  const canAfford = !balanceLoading && dabsBalance >= ENTRY_COST

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
      <div style={{ background: '#12121e', border: '1px solid #2a2a44', borderRadius: 8, maxWidth: 360, width: 'calc(100% - 32px)', padding: 28, position: 'relative' }}>
        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          style={{ position: 'absolute', top: 12, right: 14, background: 'none', border: 'none', color: '#555577', cursor: 'pointer', fontFamily: 'var(--db-font-mono)', fontSize: 16, lineHeight: 1, padding: 4 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#e0e0f0' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = '#555577' }}
        >✕</button>

        {/* Icon */}
        <div style={{ fontSize: 28, marginBottom: 12 }}>🏀</div>

        <h2 style={{ fontFamily: 'var(--db-font-mono)', fontSize: 16, fontWeight: 800, color: '#e0e0f0', margin: '0 0 6px', letterSpacing: '0.06em' }}>
          JOIN NBA GAME
        </h2>

        {/* Game matchup */}
        <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 13, color: '#8888aa', margin: '0 0 18px', letterSpacing: '0.04em' }}>
          {away} vs {home}
        </p>

        {/* Cost info box */}
        <div style={{ background: '#1a1a2e', border: '1px solid #2a2a44', borderRadius: 4, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', letterSpacing: '0.06em' }}>ENTRY FEE</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: '#ff6b35', letterSpacing: '0.04em' }}>{ENTRY_COST} ◈</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#555577', letterSpacing: '0.06em' }}>YOUR BALANCE</span>
            <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 800, color: balanceLoading ? '#555577' : canAfford ? '#e0e0f0' : '#ff2d2d', letterSpacing: '0.04em' }}>
              {balanceLoading ? '…' : `${dabsBalance} ◈`}
            </span>
          </div>
        </div>

        {!balanceLoading && !canAfford && (
          <p style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#ff2d2d', margin: '0 0 14px', letterSpacing: '0.04em' }}>
            ✕ Not enough Dabs. Visit the store to get more.
          </p>
        )}

        {/* Confirm button */}
        <button
          type="button"
          onClick={onConfirm}
          disabled={!canAfford}
          style={{
            width: '100%',
            background: canAfford ? '#ff6b35' : '#2a2a44',
            color: canAfford ? '#0c0c14' : '#555577',
            border: 'none',
            borderRadius: 4,
            fontFamily: 'var(--db-font-mono)',
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: '0.08em',
            padding: '10px 0',
            cursor: canAfford ? 'pointer' : 'not-allowed',
            marginBottom: 8,
            transition: 'background 100ms ease',
          }}
          onMouseEnter={(e) => { if (canAfford) e.currentTarget.style.background = '#ff8855' }}
          onMouseLeave={(e) => { if (canAfford) e.currentTarget.style.background = '#ff6b35' }}
        >
          CONFIRM — {ENTRY_COST} ◈
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
