import { memo } from 'react'

/**
 * A single 5×5 mini-grid showing one completed bingo line.
 * Only the 5 squares in the line are highlighted orange.
 */
const LineMiniGrid = memo(function LineMiniGrid({ lineIndices, lineNumber, onTap }) {
  const lineSet = new Set(lineIndices)

  return (
    <div
      onClick={() => onTap?.(lineIndices)}
      style={{
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        animation: 'minimap-pop-in 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        animationDelay: `${lineNumber * 80}ms`,
      }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 2,
        padding: 3,
        background: 'var(--db-bg-elevated)',
        borderRadius: 4,
        border: '1px solid rgba(255,107,53,0.15)',
      }}>
        {Array.from({ length: 25 }, (_, i) => (
          <div
            key={i}
            style={{
              width: 6,
              height: 6,
              borderRadius: 1.5,
              background: lineSet.has(i)
                ? 'var(--db-primary)'
                : 'var(--db-bg-hover)',
              boxShadow: lineSet.has(i)
                ? '0 0 3px rgba(255,107,53,0.4)'
                : 'none',
            }}
          />
        ))}
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono',monospace",
        fontSize: 8,
        fontWeight: 700,
        color: 'var(--db-primary)',
        opacity: 0.6,
        letterSpacing: '0.04em',
      }}>
        LINE {lineNumber}
      </span>
    </div>
  )
})

/**
 * Row of mini-maps for all completed bingo lines.
 * @param {number[][]} winningLines - array of arrays of square indices (0-24)
 * @param {function} onHighlightLine - callback(lineIndices) to flash-highlight on main board
 */
export default function BingoLineMiniMap({ winningLines, onHighlightLine }) {
  if (!winningLines?.length) return null

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      marginTop: 10,
      flexWrap: 'wrap',
    }}>
      {winningLines.map((line, i) => (
        <LineMiniGrid
          key={i}
          lineIndices={line}
          lineNumber={i + 1}
          onTap={onHighlightLine}
        />
      ))}
    </div>
  )
}
