import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'

const MAX_SWAPS = 2

const randomId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

function oddsLabel(odds) {
  if (odds == null) return ''
  return odds > 0 ? `+${odds}` : `${odds}`
}

function SwapModal({
  isOpen,
  onClose,
  currentSquare,
  squareIndex,
  candidates = [],
  swapCount,
  roomId,
  onSwapComplete,
}) {
  const [selected, setSelected] = useState(null)
  const [confirming, setConfirming] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const cost = swapCount === 0 ? 10 : 50

  const handleSelect = (candidate) => {
    setSelected(candidate)
    setConfirming(true)
    setError('')
  }

  const handleBack = () => {
    setConfirming(false)
    setSelected(null)
    setError('')
  }

  const handleClose = () => {
    setSelected(null)
    setConfirming(false)
    setError('')
    onClose()
  }

  const handleConfirm = async () => {
    if (!selected) return
    setLoading(true)
    setError('')

    const newSquare = {
      id: randomId(),
      player_id: selected.player_id ?? null,
      player_name: selected.player_name ?? null,
      team_abbr: selected.team_abbr ?? '',
      stat_type: selected.stat_type,
      threshold: selected.threshold,
      display_text: selected.display_text,
      american_odds: selected.american_odds,
      implied_prob: selected.implied_prob ?? null,
      tier: selected.tier ?? null,
      conflict_key: selected.conflict_key,
      marked: false,
    }

    const { data, error: rpcError } = await supabase.rpc('swap_card_square', {
      p_room_id: roomId,
      p_square_index: squareIndex,
      p_new_square: newSquare,
    })

    setLoading(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }

    if (data && !data.success) {
      if (data.reason === 'insufficient_dabs') {
        setError(`Not enough Dabs! Need ${cost}, have ${data.balance ?? 0}.`)
      } else if (data.reason === 'max_swaps_reached') {
        setError(`Max swaps reached (${MAX_SWAPS}/${MAX_SWAPS})!`)
      } else if (data.reason === 'game_already_started') {
        setError('Too late — game is already live!')
      } else {
        setError(data.reason || 'Swap failed. Please try again.')
      }
      return
    }

    onSwapComplete(newSquare, squareIndex, data?.new_balance)
    handleClose()
  }

  if (!isOpen) return null

  const currentOdds = currentSquare?.american_odds
  const swapNumLabel = `${swapCount + 1}/${MAX_SWAPS}`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Swap Square"
      className="modal-overlay"
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
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div
        className="modal-panel-in"
        style={{
          background: 'var(--db-bg-surface)',
          border: '1px solid var(--db-border-default)',
          borderRadius: 14,
          maxWidth: 400,
          width: 'calc(100% - 32px)',
          padding: 20,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 16, letterSpacing: '0.08em', color: '#ff6b35' }}>
            SWAP SQUARE
          </span>
          <button
            type="button"
            onClick={handleClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--db-text-muted)', fontSize: 16, padding: '2px 6px', lineHeight: 1, borderRadius: 4, transition: 'color 120ms ease' }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--db-text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--db-text-ghost)' }}
            aria-label="Cancel"
          >
            ✕
          </button>
        </div>

        {/* Current square */}
        <div>
          <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--db-text-muted)' }}>
            CURRENT
          </span>
          <div
            style={{
              marginTop: 6,
              background: 'var(--db-bg-elevated)',
              border: '1px solid var(--db-border-default)',
              borderRadius: 8,
              padding: '8px 12px',
            }}
          >
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--db-text-primary)', display: 'block' }}>
              {currentSquare?.display_text}
            </span>
            {currentOdds != null && (
              <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: 'var(--db-text-ghost)' }}>
                {oddsLabel(currentOdds)}
                {currentSquare?.implied_prob != null && (
                  <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--db-text-muted)' }}>
                    ~{Math.round(currentSquare.implied_prob * 100)}%
                  </span>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--db-border-subtle)' }} />

        {/* Candidates or confirm step */}
        {confirming && selected ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--db-text-muted)' }}>
              REPLACE WITH
            </span>
            <div
              style={{
                background: 'rgba(255,107,53,0.06)',
                border: '1px solid rgba(255,107,53,0.3)',
                borderRadius: 8,
                padding: '10px 12px',
              }}
            >
              <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--db-text-primary)', display: 'block' }}>
                {selected.display_text}
              </span>
              {selected.american_odds != null && (
                <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#ff6b35' }}>
                  {oddsLabel(selected.american_odds)}
                  {selected.implied_prob != null && (
                    <span style={{ marginLeft: 6, fontSize: 9, color: 'var(--db-text-ghost)' }}>
                      ~{Math.round(selected.implied_prob * 100)}%
                    </span>
                  )}
                </span>
              )}
            </div>

            {error && (
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: '#ff5555', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={loading}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: loading ? 'var(--db-bg-hover)' : 'linear-gradient(135deg, #ff7a45 0%, #e05520 100%)',
                color: loading ? 'var(--db-text-ghost)' : '#fff',
                border: 'none',
                borderRadius: 8,
                fontFamily: 'var(--db-font-display)',
                fontSize: 14,
                letterSpacing: '0.06em',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: loading ? 'none' : '0 4px 14px rgba(255,107,53,0.35)',
                transition: 'opacity 100ms ease',
              }}
              onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.9' }}
              onMouseLeave={(e) => { if (!loading) e.currentTarget.style.opacity = '1' }}
            >
              {loading ? 'SWAPPING…' : `CONFIRM SWAP — ${cost} ◈`}
            </button>

            <button
              type="button"
              onClick={handleBack}
              disabled={loading}
              style={{
                width: '100%',
                padding: '8px 16px',
                background: 'var(--db-bg-elevated)',
                color: 'var(--db-text-muted)',
                border: '1px solid var(--db-border-default)',
                borderRadius: 8,
                fontFamily: 'var(--db-font-ui)',
                fontSize: 12,
                fontWeight: 500,
                cursor: loading ? 'not-allowed' : 'pointer',
                transition: 'background 100ms ease, color 100ms ease',
              }}
              onMouseEnter={(e) => { if (!loading) { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-primary)' } }}
              onMouseLeave={(e) => { if (!loading) { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-muted)' } }}
            >
              Back
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontFamily: 'var(--db-font-display)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--db-text-muted)' }}>
              PICK A REPLACEMENT
            </span>

            {candidates.length === 0 ? (
              <p style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 400, color: 'var(--db-text-muted)', textAlign: 'center', padding: '12px 0' }}>
                No similar props available
              </p>
            ) : (
              candidates.map((candidate, i) => (
                <button
                  key={candidate.conflict_key ?? i}
                  type="button"
                  onClick={() => handleSelect(candidate)}
                  style={{
                    textAlign: 'left',
                    background: 'var(--db-bg-elevated)',
                    border: '1px solid var(--db-border-default)',
                    borderRadius: 8,
                    padding: '10px 12px',
                    cursor: 'pointer',
                    transition: 'border-color 100ms ease, background 100ms ease',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,107,53,0.4)'; e.currentTarget.style.background = 'rgba(255,107,53,0.06)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--db-border-default)'; e.currentTarget.style.background = 'var(--db-bg-elevated)' }}
                >
                  <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, fontWeight: 500, color: 'var(--db-text-primary)', display: 'block' }}>
                    {candidate.display_text}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {candidate.american_odds != null && (
                      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 11, color: '#ff6b35' }}>
                        {oddsLabel(candidate.american_odds)}
                      </span>
                    )}
                    {candidate.implied_prob != null && (
                      <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 9, color: 'var(--db-text-ghost)' }}>
                        ~{Math.round(candidate.implied_prob * 100)}%
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 400, color: 'var(--db-text-muted)' }}>
            Cost: {cost} ◈ · Swap {swapNumLabel}
          </span>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'var(--db-bg-elevated)',
              color: 'var(--db-text-ghost)',
              border: '1px solid var(--db-border-default)',
              borderRadius: 6,
              fontFamily: 'var(--db-font-ui)',
              fontSize: 11,
              fontWeight: 500,
              padding: '5px 14px',
              cursor: 'pointer',
              transition: 'background 100ms ease, color 100ms ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-secondary)' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-elevated)'; e.currentTarget.style.color = 'var(--db-text-ghost)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

export default SwapModal
