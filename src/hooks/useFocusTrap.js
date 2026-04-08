import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(isOpen, { onEscape } = {}) {
  const ref = useRef(null)
  const onEscapeRef = useRef(onEscape)
  onEscapeRef.current = onEscape

  useEffect(() => {
    if (!isOpen || !ref.current) return

    const container = ref.current
    const previouslyFocused = document.activeElement

    // Focus the first focusable element inside the trap
    const focusFirst = () => {
      const first = container.querySelector(FOCUSABLE)
      first?.focus()
    }
    // Delay to allow modal animation / render
    const raf = requestAnimationFrame(focusFirst)

    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && onEscapeRef.current) {
        e.stopPropagation()
        onEscapeRef.current()
        return
      }

      if (e.key !== 'Tab') return

      const focusable = [...container.querySelectorAll(FOCUSABLE)]
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault()
          last.focus()
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      cancelAnimationFrame(raf)
      document.removeEventListener('keydown', handleKeyDown)
      // Restore focus when modal closes
      if (previouslyFocused instanceof HTMLElement) {
        previouslyFocused.focus()
      }
    }
  }, [isOpen])

  return ref
}
