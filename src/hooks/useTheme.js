import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'dobber-theme'
const VALID_THEMES = ['system', 'light', 'dark']

function getStoredTheme() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return VALID_THEMES.includes(stored) ? stored : 'dark'
  } catch {
    return 'dark'
  }
}

function getResolvedTheme(preference) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
  }
  return preference
}

function applyTheme(preference) {
  const html = document.documentElement
  html.setAttribute('data-theme', preference)
  const resolved = getResolvedTheme(preference)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'light' ? '#f5f5f0' : '#0c0c14')
  }
  document.body.style.background = resolved === 'light' ? '#f5f5f0' : '#0c0c14'
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme)

  const setTheme = useCallback((newTheme) => {
    if (!VALID_THEMES.includes(newTheme)) return
    setThemeState(newTheme)
    localStorage.setItem(STORAGE_KEY, newTheme)
    applyTheme(newTheme)
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: light)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const resolvedTheme = getResolvedTheme(theme)
  return { theme, setTheme, resolvedTheme, isDark: resolvedTheme === 'dark' }
}
