import { useNavigate } from 'react-router-dom'

export default function HeroBanner() {
  const navigate = useNavigate()

  return (
    <div
      className="relative overflow-hidden rounded-xl p-8 md:p-10"
      style={{
        background: 'linear-gradient(135deg, rgba(255,107,53,0.08) 0%, transparent 50%, var(--db-bg-page) 100%)',
        border: '1px solid rgba(255,107,53,0.2)',
      }}
    >
      {/* Glow accent — warm orange radial, top-right */}
      <div style={{
        position: 'absolute', top: -100, right: -100, width: 450, height: 450,
        background: 'radial-gradient(circle, rgba(255,107,53,0.28) 0%, rgba(255,107,53,0.08) 45%, transparent 70%)',
        pointerEvents: 'none',
        filter: 'blur(2px)',
      }} />
      {/* Secondary soft glow */}
      <div style={{
        position: 'absolute', top: 40, right: 60, width: 200, height: 200,
        background: 'radial-gradient(circle, rgba(255,140,80,0.12) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />

      <div className="relative z-10 max-w-lg">
        <p
          style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--db-primary)', marginBottom: 12 }}
        >
          NBA BINGO — FREE TO PLAY
        </p>
        <h1
          style={{
            fontFamily: 'var(--db-font-display)',
            fontSize: 'clamp(38px, 5.5vw, 60px)',
            color: 'var(--db-text-primary)',
            lineHeight: 1.05,
            letterSpacing: '0.02em',
          }}
        >
          The game you can&apos;t lose.
        </h1>
        <p
          className="mt-4 leading-relaxed"
          style={{ fontFamily: 'var(--db-font-ui)', fontWeight: 400, color: 'var(--db-text-muted)', fontSize: 'clamp(14px, 2vw, 17px)', maxWidth: 460 }}
        >
          Live bingo cards powered by real NBA stats. Free to play. Every game.
        </p>
        <button
          type="button"
          onClick={() => navigate('/games')}
          style={{
            marginTop: 24,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            borderRadius: 8,
            padding: '11px 24px',
            background: 'var(--db-gradient-primary)',
            color: '#fff',
            border: 'none',
            fontFamily: 'var(--db-font-display)',
            fontSize: 14,
            letterSpacing: '0.06em',
            cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(255,107,53,0.4)',
            transition: 'opacity 150ms ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9' }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1' }}
        >
          BROWSE TONIGHT&apos;S GAMES →
        </button>
      </div>
    </div>
  )
}
