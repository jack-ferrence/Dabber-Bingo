import { Routes, Route, Link, Navigate, useMatch } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import { useProfile } from './hooks/useProfile.js'
import LobbyPage from './pages/LobbyPage.jsx'
import GamePage from './pages/GamePage.jsx'
import LoginPage from './pages/LoginPage.jsx'
import RegisterPage from './pages/RegisterPage.jsx'
import StorePage from './pages/StorePage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import ProtectedRoute from './pages/ProtectedRoute.jsx'
import AppShell from './components/layout/AppShell.jsx'
import AdminFeaturedPage from './pages/AdminFeaturedPage.jsx'

function App() {
  const { user, loading } = useAuth()
  const { username: profileUsername } = useProfile()
  const isGameRoute = useMatch('/room/:roomId')

  // Game room: full-screen, no sidebar or sport tabs
  if (isGameRoute) {
    if (loading) {
      return (
        <div style={{ minHeight: '100vh', background: '#0c0c14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Loading...</span>
        </div>
      )
    }
    if (!user) return <Navigate to="/login" replace />

    return (
      <div className="h-screen flex flex-col" style={{ background: '#0c0c14' }}>
        <header
          className="flex h-12 shrink-0 items-center justify-between px-3"
          style={{ background: 'rgba(10,10,18,0.97)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)' }}
        >
          <Link
            to="/"
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 'clamp(16px, 4vw, 24px)',
              letterSpacing: '0.15em',
              color: '#ff6b35',
              textDecoration: 'none',
              lineHeight: 1,
            }}
          >
            DOBBER
          </Link>
          {user && (
            <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
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
        </Route>
        <Route
          path="*"
          element={
            <div className="p-8 text-center" style={{ fontFamily: 'var(--db-font-ui)', color: 'rgba(255,255,255,0.25)' }}>
              Page not found
            </div>
          }
        />
      </Routes>
    </AppShell>
  )
}

export default App
