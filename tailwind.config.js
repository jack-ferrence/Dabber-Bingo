/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ── PRIMARY BRAND: DOBBER — Arcade Scoreboard ──────────────
        db: {
          // Primary — Burnt Orange
          primary: {
            light:   '#ff8855',
            DEFAULT: '#ff6b35',
            dark:    '#e05520',
          },
          // Backgrounds — dark navy scale
          bg: {
            page:     '#0c0c14',
            surface:  '#12121e',
            elevated: '#1a1a2e',
            hover:    '#22223a',
            active:   '#2a2a44',
          },
          // Text scale
          text: {
            bright:    '#f0f0ff',
            primary:   '#e0e0f0',
            secondary: '#8888aa',
            muted:     '#555577',
            ghost:     '#3a3a55',
          },
          // Borders
          border: {
            subtle:  '#1a1a2e',
            DEFAULT: '#2a2a44',
            active:  '#3a3a55',
          },
          // Semantic
          live:    '#ff2d2d',
          success: '#22c55e',
          warn:    '#f59e0b',
          info:    '#3b82f6',
          danger:  '#ef4444',
        },
      },

      fontFamily: {
        display: ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
        heading:  ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
        body:     ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
        mono:     ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
        sans:     ['"JetBrains Mono"', '"Fira Code"', '"SF Mono"', 'monospace'],
      },

      backgroundImage: {
        'db-primary': 'linear-gradient(135deg, #ff6b35 0%, #e05520 100%)',
        'db-hero':    'linear-gradient(180deg, #0c0c14 0%, #12121e 50%, #0c0c14 100%)',
        'db-glow':    'radial-gradient(ellipse at center, rgba(255,107,53,0.04) 0%, transparent 70%)',
      },

      boxShadow: {
        'db-sm':    'none',
        'db-md':    '0 4px 24px rgba(0,0,0,0.5)',
        'db-lg':    '0 8px 40px rgba(0,0,0,0.6)',
        'db-glow':  '0 0 20px rgba(255,107,53,0.15)',
        'db-amber': '0 0 20px rgba(255,107,53,0.15)',
        'db-live':  '0 0 16px rgba(255,45,45,0.30)',
      },

      borderRadius: {
        'db-xs': '2px',
        'db-sm': '3px',
        'db-md': '4px',
        'db-lg': '8px',
        'db-xl': '12px',
      },

      animation: {
        'db-pulse':     'db-pulse 1.5s ease-in-out infinite',
        'db-mark':      'db-mark 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'db-bingo':     'db-bingo 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'db-ring':      'db-ring 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },

      keyframes: {
        'db-pulse': {
          '0%, 100%': { opacity: '1' },
          '50%':      { opacity: '0.4' },
        },
        'db-mark': {
          '0%':   { transform: 'scale(0.85)', opacity: '0' },
          '50%':  { transform: 'scale(1.06)' },
          '100%': { transform: 'scale(1)',    opacity: '1' },
        },
        'db-bingo': {
          '0%':   { transform: 'scale(1)' },
          '30%':  { transform: 'scale(1.05)' },
          '60%':  { transform: 'scale(0.97)' },
          '100%': { transform: 'scale(1)' },
        },
        'db-ring': {
          '0%':   { transform: 'rotate(-15deg)' },
          '25%':  { transform: 'rotate(15deg)' },
          '50%':  { transform: 'rotate(-10deg)' },
          '75%':  { transform: 'rotate(10deg)' },
          '100%': { transform: 'rotate(0deg)' },
        },
      },
    },
  },
};
