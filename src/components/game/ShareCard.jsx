import { useCallback, useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

/**
 * Renders the player's bingo card result to a canvas and shares/downloads it.
 * No external dependencies — uses the native Canvas API.
 */

const ORANGE = '#ff6b35'
const DARK = '#0c0c14'
const SURFACE = '#1a1a2e'
const CARD_W = 1080
const CARD_H = 1920

function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

async function renderShareCard({ flatSquares, markedCount, linesCount, rank, totalPlayers, roomName, sport }) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')

  // ── Background ──
  ctx.fillStyle = DARK
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // Subtle orange glow at top
  const topGlow = ctx.createRadialGradient(CARD_W / 2, 0, 0, CARD_W / 2, 0, 600)
  topGlow.addColorStop(0, 'rgba(255,107,53,0.12)')
  topGlow.addColorStop(1, 'transparent')
  ctx.fillStyle = topGlow
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  // ── Header: logo + wordmark ──
  const HEADER_Y = 120
  // Ball mark (simple circle + ring)
  const BX = 120, BY = HEADER_Y, BR = 56
  ctx.beginPath(); ctx.arc(BX + 8, BY + 8, BR, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,107,53,0.15)'; ctx.fill()
  ctx.beginPath(); ctx.arc(BX, BY, BR, 0, Math.PI * 2)
  const ballGrad = ctx.createLinearGradient(BX - BR * 0.3, BY - BR * 0.1, BX + BR * 0.7, BY + BR * 0.9)
  ballGrad.addColorStop(0, '#f2efe9'); ballGrad.addColorStop(1, '#c8c5bf')
  ctx.fillStyle = ballGrad; ctx.fill()
  ctx.beginPath(); ctx.arc(BX, BY, BR * 0.59, 0, Math.PI * 2)
  const ringGrad = ctx.createLinearGradient(BX - BR, BY - BR, BX + BR, BY + BR)
  ringGrad.addColorStop(0, '#ffaa44'); ringGrad.addColorStop(0.5, '#ff6b35'); ringGrad.addColorStop(1, '#b8400e')
  ctx.strokeStyle = ringGrad; ctx.lineWidth = 9; ctx.stroke()
  ctx.font = `900 ${BR * 1.1}px Outfit, sans-serif`
  ctx.fillStyle = '#1a1a2e'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('D', BX, BY + 2)
  // Wordmark
  ctx.font = '900 72px Outfit, sans-serif'
  ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('DOBBER', BX + BR + 28, BY)
  // Tagline
  ctx.font = '400 24px "JetBrains Mono", monospace'
  ctx.fillStyle = ORANGE; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'
  ctx.fillText('FREE SPORTS BINGO', BX + BR + 30, BY + 52)

  // ── Room name ──
  ctx.font = '600 32px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(roomName ?? '', CARD_W / 2, HEADER_Y + 130)

  // ── 5×5 Grid ──
  const GRID_TOP = HEADER_Y + 180
  const GRID_PAD = 60
  const CELL_GAP = 10
  const GRID_W = CARD_W - GRID_PAD * 2
  const CELL_SIZE = (GRID_W - CELL_GAP * 4) / 5

  for (let i = 0; i < 25; i++) {
    const col = i % 5
    const row = Math.floor(i / 5)
    const x = GRID_PAD + col * (CELL_SIZE + CELL_GAP)
    const y = GRID_TOP + row * (CELL_SIZE + CELL_GAP)
    const sq = flatSquares[i]
    const isFree = i === 12
    const isMarked = sq?.marked === true || isFree

    // Cell background
    drawRoundedRect(ctx, x, y, CELL_SIZE, CELL_SIZE, 12)
    if (isFree) {
      ctx.fillStyle = ORANGE
    } else if (isMarked) {
      ctx.fillStyle = 'rgba(255,107,53,0.12)'
    } else {
      ctx.fillStyle = SURFACE
    }
    ctx.fill()

    // Border
    drawRoundedRect(ctx, x, y, CELL_SIZE, CELL_SIZE, 12)
    ctx.strokeStyle = isMarked && !isFree ? 'rgba(255,107,53,0.5)' : 'rgba(255,255,255,0.06)'
    ctx.lineWidth = isMarked && !isFree ? 2 : 1
    ctx.stroke()

    // Left accent bar (marked → orange, else skip on share card)
    if (isMarked && !isFree) {
      ctx.fillStyle = ORANGE
      ctx.fillRect(x, y + 12, 3, CELL_SIZE - 24)
    }

    if (isFree) {
      ctx.font = '900 36px Outfit, sans-serif'
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('FREE', x + CELL_SIZE / 2, y + CELL_SIZE / 2)
      continue
    }

    if (!sq?.display_text) continue
    // Parse player + stat
    let player = '', stat = sq.display_text
    const m = sq.display_text.match(/^(.+?)\s+([\d.]+\+?\s+\S+)$/)
    if (m) { player = m[1]; stat = m[2] }

    const TEXT_X = x + 14
    // Player name
    ctx.font = `800 ${CELL_SIZE * 0.135}px "JetBrains Mono", monospace`
    ctx.fillStyle = isMarked ? ORANGE : '#e8e8f4'
    ctx.textAlign = 'left'; ctx.textBaseline = 'top'
    // Clip long names
    const maxW = CELL_SIZE - 20
    let displayPlayer = player
    while (displayPlayer.length > 0 && ctx.measureText(displayPlayer).width > maxW) {
      displayPlayer = displayPlayer.slice(0, -1)
    }
    ctx.fillText(displayPlayer, TEXT_X, y + CELL_SIZE * 0.18)
    // Stat line
    ctx.font = `600 ${CELL_SIZE * 0.115}px "JetBrains Mono", monospace`
    ctx.fillStyle = isMarked ? 'rgba(255,107,53,0.6)' : 'rgba(255,107,53,0.8)'
    ctx.fillText(stat, TEXT_X, y + CELL_SIZE * 0.38)

    // Progress bar at bottom
    if (isMarked) {
      ctx.fillStyle = ORANGE
      ctx.fillRect(x, y + CELL_SIZE - 5, CELL_SIZE, 5)
    }
  }

  // ── Stats ──
  const STATS_Y = GRID_TOP + 5 * (CELL_SIZE + CELL_GAP) + 60

  // Marked count
  ctx.font = '900 96px Outfit, sans-serif'
  ctx.fillStyle = ORANGE; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'
  ctx.fillText(`${markedCount}`, CARD_W / 2 - 160, STATS_Y + 96)
  ctx.font = '600 28px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText('/25 SQUARES', CARD_W / 2 - 160, STATS_Y + 140)

  // Lines
  ctx.font = '900 96px Outfit, sans-serif'
  ctx.fillStyle = '#e8e8f4'; ctx.textAlign = 'center'
  ctx.fillText(`${linesCount}`, CARD_W / 2 + 160, STATS_Y + 96)
  ctx.font = '600 28px "JetBrains Mono", monospace'
  ctx.fillStyle = 'rgba(255,255,255,0.4)'
  ctx.fillText(`LINE${linesCount !== 1 ? 'S' : ''}`, CARD_W / 2 + 160, STATS_Y + 140)

  // Rank
  if (rank > 0 && totalPlayers > 0) {
    ctx.font = '700 32px Outfit, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.textAlign = 'center'
    const ordinal = rank === 1 ? '1st' : rank === 2 ? '2nd' : rank === 3 ? '3rd' : `${rank}th`
    ctx.fillText(`${ordinal} of ${totalPlayers} players`, CARD_W / 2, STATS_Y + 210)
  }

  // ── Bottom strip ──
  const FOOTER_Y = CARD_H - 120
  ctx.font = '400 26px "JetBrains Mono", monospace'
  ctx.fillStyle = ORANGE; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('Play free at bingo-v04.netlify.app', CARD_W / 2, FOOTER_Y + 30)

  // Orange gradient strip
  const strip = ctx.createLinearGradient(0, 0, CARD_W, 0)
  strip.addColorStop(0, '#ffaa44'); strip.addColorStop(0.5, '#ff6b35'); strip.addColorStop(1, '#b8400e')
  ctx.fillStyle = strip
  ctx.fillRect(0, CARD_H - 8, CARD_W, 8)

  return canvas
}

export default function ShareCard({ flatSquares, markedCount, linesCount, rank, totalPlayers, roomName, sport, roomId, userId, onBonusClaimed }) {
  const [sharing, setSharing] = useState(false)
  const [bonusClaimed, setBonusClaimed] = useState(false)
  const [bonusAmount, setBonusAmount] = useState(0)
  const [showBonusBanner, setShowBonusBanner] = useState(false)

  // Check if share bonus was already claimed for this card
  useEffect(() => {
    if (!userId || !roomId) return
    let cancelled = false
    async function check() {
      const { data } = await supabase
        .from('dabs_transactions')
        .select('id, amount')
        .eq('user_id', userId)
        .eq('reason', 'share_bonus')
        .eq('room_id', roomId)
        .maybeSingle()
      if (!cancelled && data) {
        setBonusClaimed(true)
        setBonusAmount(data.amount)
      }
    }
    check()
    return () => { cancelled = true }
  }, [userId, roomId])

  const claimShareBonus = useCallback(async () => {
    if (!roomId || bonusClaimed) return

    const { data, error } = await supabase.rpc('claim_share_bonus', { p_room_id: roomId })
    if (error) {
      console.warn('[ShareCard] share bonus RPC failed', error)
      return
    }
    if (!data?.success) return

    setBonusClaimed(true)
    setBonusAmount(data.bonus)
    setShowBonusBanner(true)
    onBonusClaimed?.(data.bonus)
  }, [roomId, bonusClaimed, onBonusClaimed])

  const handleShare = useCallback(async () => {
    if (sharing) return
    setSharing(true)
    try {
      const canvas = await renderShareCard({ flatSquares, markedCount, linesCount, rank, totalPlayers, roomName, sport })
      canvas.toBlob(async (blob) => {
        const filename = `dobber-bingo-${Date.now()}.png`
        let shared = false
        if (navigator.share && navigator.canShare?.({ files: [new File([blob], filename, { type: 'image/png' })] })) {
          try {
            await navigator.share({
              title: 'My Dobber Bingo Card',
              text: `${markedCount}/25 squares • ${linesCount} line${linesCount !== 1 ? 's' : ''} — bingo-v04.netlify.app`,
              files: [new File([blob], filename, { type: 'image/png' })],
            })
            shared = true
          } catch (e) {
            if (e.name !== 'AbortError') {
              fallbackDownload(blob, filename)
              shared = true // download counts as sharing
            }
          }
        } else {
          fallbackDownload(blob, filename)
          shared = true
        }

        // Claim share bonus after successful share
        if (shared && !bonusClaimed) {
          await claimShareBonus()
        }

        setSharing(false)
      }, 'image/png')
    } catch (e) {
      console.warn('[ShareCard] render failed', e)
      setSharing(false)
    }
  }, [flatSquares, markedCount, linesCount, rank, totalPlayers, roomName, sport, sharing, bonusClaimed, claimShareBonus])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      {/* Share bonus banner — shown after claiming */}
      {showBonusBanner && (
        <div
          className="celebrate-pop"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}
        >
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, fontWeight: 600, color: 'var(--db-success)' }}>
            Share bonus claimed!
          </span>
          <span style={{ fontFamily: 'var(--db-font-mono)', fontSize: 14, fontWeight: 700, color: 'var(--db-success)' }}>
            +{bonusAmount} ◈
          </span>
        </div>
      )}

      {/* Already claimed indicator */}
      {bonusClaimed && !showBonusBanner && (
        <div style={{
          width: '100%', padding: '6px 12px', borderRadius: 6,
          background: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.15)',
          textAlign: 'center',
        }}>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 11, fontWeight: 500, color: 'var(--db-text-muted)' }}>
            ✓ Share bonus earned (+{bonusAmount} ◈)
          </span>
        </div>
      )}

      <button
        type="button"
        onClick={handleShare}
        disabled={sharing}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: bonusClaimed ? '10px 20px' : '12px 24px',
          borderRadius: 8,
          background: bonusClaimed
            ? 'rgba(255,107,53,0.1)'
            : 'linear-gradient(135deg, rgba(255,107,53,0.15), rgba(255,107,53,0.08))',
          border: bonusClaimed
            ? '1px solid rgba(255,107,53,0.25)'
            : '1px solid rgba(255,107,53,0.35)',
          fontFamily: 'var(--db-font-mono)', fontSize: 12, fontWeight: 600,
          color: sharing ? 'rgba(255,107,53,0.4)' : ORANGE,
          cursor: sharing ? 'wait' : 'pointer',
          transition: 'background 120ms ease, border-color 120ms ease, transform 100ms ease',
          boxShadow: bonusClaimed ? 'none' : '0 2px 12px rgba(255,107,53,0.2)',
        }}
      >
        <span style={{ fontSize: 14 }}>{sharing ? '⏳' : '↗'}</span>
        {sharing
          ? 'Generating...'
          : bonusClaimed
            ? 'Share Again'
            : `Share & Earn 1.8× Dobs`}
      </button>
    </div>
  )
}

function fallbackDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
