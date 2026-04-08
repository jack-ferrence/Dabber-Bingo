import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'dobber-theme'
const VALID_THEMES = ['dark']

function getStoredTheme() {
  return 'dark'
}

function getResolvedTheme(preference) {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return preference
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', 'dark')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', '#0c0c14')
  document.body.style.background = '#0c0c14'
  document.body.style.color = '#e0e0f0'
}

export function useTheme() {
  const [theme, setThemeState] = useState(getStoredTheme)

  const setTheme = useCallback(() => {
    // Light mode disabled — always dark
    setThemeState('dark')
    localStorage.setItem(STORAGE_KEY, 'dark')
    applyTheme()
  }, [])

  useEffect(() => {
    applyTheme(theme)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = () => applyTheme('system')
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [theme])

  const resolvedTheme = getResolvedTheme(theme)
  return { theme, setTheme, resolvedTheme, isDark: resolvedTheme === 'dark' }
}
