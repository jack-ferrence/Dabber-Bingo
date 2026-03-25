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

function App() {
  const { user, loading } = useAuth()
  const { username: profileUsername } = useProfile()
  const isGameRoute = useMatch('/room/:roomId')

  // Game room: full-screen, no sidebar or sport tabs
  if (isGameRoute) {
    if (loading) {
      return (
        <div style={{ minHeight: '100vh', background: '#0c0c14', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#555577' }}>Loading...</span>
        </div>
      )
    }
    if (!user) return <Navigate to="/login" replace />

    return (
      <div className="h-screen flex flex-col" style={{ background: '#0c0c14' }}>
        <header
          className="flex h-14 shrink-0 items-center justify-between px-4"
          style={{ background: '#0c0c14', borderBottom: '1px solid #2a2a44' }}
        >
          <Link
            to="/"
            style={{
              fontFamily: 'var(--db-font-display)',
              fontSize: 24,
              letterSpacing: '0.15em',
              color: '#ff6b35',
              textDecoration: 'none',
              lineHeight: 1,
            }}
          >
            DOBBER
          </Link>
          {user && (
            <span style={{ color: '#555577', fontSize: 12, fontFamily: 'var(--db-font-mono)' }}>
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
        </Route>
        <Route
          path="*"
          element={
            <div className="p-8 text-center" style={{ color: '#555577' }}>
              Page not found
            </div>
          }
        />
      </Routes>
    </AppShell>
  )
}

export default App
