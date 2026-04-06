import { useCallback, useEffect, useRef, useState } from 'react'

const arrowBase = {
  position: 'absolute',
  top: '50%',
  transform: 'translateY(-60%)',
  zIndex: 10,
  width: 32,
  height: 32,
  borderRadius: '50%',
  background: 'var(--db-bg-hover)',
  border: '1px solid var(--db-border-default)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  color: 'var(--db-text-muted)',
  transition: 'background 100ms ease, color 100ms ease',
  flexShrink: 0,
}

export default function HorizontalSlider({ children, scrollAmount = 320 }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 2)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2)
  }, [])

  useEffect(() => {
    updateArrows()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', updateArrows, { passive: true })
    const ro = new ResizeObserver(updateArrows)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', updateArrows)
      ro.disconnect()
    }
  }, [updateArrows])

  const scrollLeft = () => scrollRef.current?.scrollBy({ left: -scrollAmount, behavior: 'smooth' })
  const scrollRight = () => scrollRef.current?.scrollBy({ left: scrollAmount, behavior: 'smooth' })

  return (
    <div style={{ position: 'relative' }}>
      {canScrollLeft && (
        <button
          type="button"
          aria-label="Scroll left"
          onClick={scrollLeft}
          style={{ ...arrowBase, left: -14 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-active)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2L4 6l4 4" />
          </svg>
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex gap-4 pb-3 no-scrollbar"
        style={{ overflowX: 'auto' }}
      >
        {children}
      </div>

      {canScrollRight && (
        <button
          type="button"
          aria-label="Scroll right"
          onClick={scrollRight}
          style={{ ...arrowBase, right: -14 }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--db-bg-active)'; e.currentTarget.style.color = 'var(--db-text-primary)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--db-bg-hover)'; e.currentTarget.style.color = 'var(--db-text-muted)' }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 2l4 4-4 4" />
          </svg>
        </button>
      )}
    </div>
  )
}
