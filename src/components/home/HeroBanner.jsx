import { useNavigate } from 'react-router-dom'

export default function HeroBanner() {
  const navigate = useNavigate()

  return (
    <div
      className="relative overflow-hidden rounded-xl p-8 md:p-10"
      style={{
        background: '#1a1a2e',
        borderLeft: '2px solid #ff6b35',
      }}
    >

      <div className="relative z-10 max-w-lg">
        <p
          className="mb-3 text-xs font-bold uppercase"
          style={{ color: '#ff6b35', letterSpacing: '0.2em' }}
        >
          NBA Bingo — Free to Play
        </p>
        <h1
          style={{
            fontFamily: 'var(--db-font-display)',
            fontSize: 'clamp(38px, 5.5vw, 60px)',
            color: '#e0e0f0',
            lineHeight: 1.05,
            letterSpacing: '0.02em',
          }}
        >
          The game you can&apos;t lose.
        </h1>
        <p
          className="mt-4 leading-relaxed"
          style={{ color: '#8888aa', fontSize: 'clamp(14px, 2vw, 18px)', maxWidth: 460 }}
        >
          Live bingo cards powered by real NBA stats. Free to play. Every game.
        </p>
        <button
          type="button"
          onClick={() => navigate('/games')}
          className="mt-6 inline-flex items-center gap-2 rounded-lg px-6 py-3 text-sm font-bold transition-all duration-200 hover:bg-[#ff8855]"
          style={{
            background: '#ff6b35',
            color: '#0c0c14',
            boxShadow: '0 0 0 0 rgba(255,107,53,0)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 20px rgba(255,107,53,0.3)' }}
          onMouseLeave={(e) => { e.currentTarget.style.boxShadow = '0 0 0 0 rgba(255,107,53,0)' }}
        >
          Browse Tonight&apos;s Games →
        </button>
      </div>
    </div>
  )
}
