import { useState, useCallback } from 'react'
import { Routes, Route, Link, Navigate, useMatch } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import { useProfile } from './hooks/useProfile.js'
import SplashScreen from './components/ui/SplashScreen.jsx'
import DobberLogo from './components/ui/DobberLogo.jsx'
import LobbyPage from './pages/LobbyPage.jsx'
import GamePage from './pages/GamePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import StorePage from './pages/StorePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import ProtectedRoute from './pages/ProtectedRoute.jsx'
import AppShell from './components/layout/AppShell.jsx'
import AdminFeaturedPage from './pages/AdminFeaturedPage.jsx'
import ContributePage from './pages/ContributePage.jsx'

function App() {
  const { user, loading } = useAuth()
  const { username: profileUsername } = useProfile()
  const isGameRoute = useMatch('/room/:roomId')

  const [splashDone, setSplashDone] = useState(() => {
    return sessionStorage.getItem('dobber-splash') === '1'
  })

  const handleSplashDone = useCallback(() => {
    sessionStorage.setItem('dobber-splash', '1')
    setSplashDone(true)
  }, [])

  if (!splashDone) {
    return <SplashScreen onFinished={handleSplashDone} />
  }

  // Game room: full-screen, no sidebar or sport tabs
  if (isGameRoute) {
    if (loading) {
      return (
        <div style={{ minHeight: '100vh', background: 'var(--db-bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, color: 'var(--db-text-secondary)' }}>Loading...</span>
        </div>
      )
    }
    if (!user) return <Navigate to="/login" replace />

    return (
      <div className="h-screen flex flex-col" style={{ background: 'var(--db-bg-page)' }}>
        <header
          className="flex h-12 shrink-0 items-center justify-between px-3"
          style={{ background: 'var(--db-bg-overlay)', borderBottom: '1px solid var(--db-border-subtle)', backdropFilter: 'blur(12px)' }}
        >
          <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
            <DobberLogo size={22} />
            <span style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 'clamp(14px, 3vw, 20px)',
              letterSpacing: '0.15em',
              color: 'var(--db-text-primary)',
              lineHeight: 1,
            }}>DOBBER</span>
          </Link>
          {user && (
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'var(--db-text-ghost)' }}>
              {profileUsername ?? user.email}
            </span>
          )}
        </header>

        <main className="flex-1 overflow-hidden">
          <Routes>
            <Route path="/room/:roomId" element={<GamePage />} />
          </Routes>
        </main>
      </div>
    )
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<LobbyPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin/featured" element={<AdminFeaturedPage />} />
          <Route path="/contribute" element={<ContributePage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="p-8 text-center" style={{ fontFamily: 'var(--db-font-ui)', color: 'rgba(255,255,255,0.4)' }}>
              Page not found
            </div>
          }
        />
      </Routes>
    </AppShell>
  )
}

export default App
