import { useState, useCallback, lazy, Suspense } from 'react'
import { Routes, Route, Link, Navigate, useMatch } from 'react-router-dom'
import { useAuth } from './hooks/useAuth.jsx'
import { useNetworkStatus } from './hooks/useNetworkStatus.js'
import { useProfile } from './hooks/useProfile.js'
import { lazyRetry } from './lib/lazyRetry.js'
import SplashScreen from './components/ui/SplashScreen.jsx'
import DobberLogo from './components/ui/DobberLogo.jsx'
import ProtectedRoute from './pages/ProtectedRoute.jsx'
import AppShell from './components/layout/AppShell.jsx'

// Route-level code splitting — each page loads on demand
const HomePage = lazy(() => lazyRetry(() => import('./pages/HomePage.jsx')))
const LobbyPage = lazy(() => lazyRetry(() => import('./pages/LobbyPage.jsx')))
const GamePage = lazy(() => lazyRetry(() => import('./pages/GamePage.jsx')))
const LoginPage = lazy(() => lazyRetry(() => import('./pages/LoginPage.jsx')))
const RegisterPage = lazy(() => lazyRetry(() => import('./pages/RegisterPage.jsx')))
const StorePage = lazy(() => lazyRetry(() => import('./pages/StorePage.jsx')))
const SettingsPage = lazy(() => lazyRetry(() => import('./pages/SettingsPage.jsx')))
const AdminFeaturedPage = lazy(() => lazyRetry(() => import('./pages/AdminFeaturedPage.jsx')))
const ContributePage = lazy(() => lazyRetry(() => import('./pages/ContributePage.jsx')))
const PrivacyPage = lazy(() => lazyRetry(() => import('./pages/PrivacyPage.jsx')))
const TermsPage = lazy(() => lazyRetry(() => import('./pages/TermsPage.jsx')))
const DailyPicksPage = lazy(() => lazyRetry(() => import('./pages/DailyPicksPage.jsx')))
const DailyTriviaPage = lazy(() => lazyRetry(() => import('./pages/DailyTriviaPage.jsx')))
const DailyGamePage = lazy(() => lazyRetry(() => import('./pages/DailyGamePage.jsx')))
const HomeRunDerbyPage = lazy(() => lazyRetry(() => import('./pages/HomeRunDerbyPage.jsx')))
const PocketPasserPage = lazy(() => lazyRetry(() => import('./pages/PocketPasserPage.jsx')))
const FlickToScorePage = lazy(() => lazyRetry(() => import('./pages/FlickToScorePage.jsx')))
const MiniGamesDashboardPage = lazy(() => lazyRetry(() => import('./pages/MiniGamesDashboardPage.jsx')))
const RankPage = lazy(() => lazyRetry(() => import('./pages/RankPage.jsx')))

function OfflineBanner() {
  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
      background: 'rgba(255, 45, 45, 0.95)',
      backdropFilter: 'blur(8px)',
      paddingTop: 'calc(8px + env(safe-area-inset-top, 0px))',
      paddingBottom: 8, paddingLeft: 16, paddingRight: 16,
      textAlign: 'center',
    }}>
      <div style={{ fontFamily: 'var(--db-font-display)', fontSize: 11, letterSpacing: '0.1em', color: '#fff', fontWeight: 800 }}>
        NO CONNECTION
      </div>
      <div style={{ fontFamily: 'var(--db-font-mono)', fontSize: 10, color: 'var(--db-text-secondary)', marginTop: 2 }}>
        Waiting for connection...
      </div>
    </div>
  )
}

const RouteFallback = () => (
  <div style={{ minHeight: '100vh', background: 'var(--db-bg-page)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, color: 'var(--db-text-secondary)' }}>Loading...</span>
  </div>
)

function App() {
  const { user, loading } = useAuth()
  const isOnline = useNetworkStatus()
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
        {!isOnline && <OfflineBanner />}
        <header
          className="shrink-0"
          style={{ background: 'var(--db-bg-overlay)', borderBottom: '1px solid var(--db-border-subtle)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)', paddingTop: 'env(safe-area-inset-top, 0px)' }}
        >
          <div className="flex h-12 items-center justify-between px-3">
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
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/room/:roomId" element={<GamePage />} />
            </Routes>
          </Suspense>
        </main>
      </div>
    )
  }

  return (
    <AppShell>
      {!isOnline && <OfflineBanner />}
      <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/games" element={<LobbyPage />} />
          <Route path="/daily/picks" element={<DailyPicksPage />} />
          <Route path="/daily/trivia" element={<DailyTriviaPage />} />
          <Route path="/daily/game" element={<DailyGamePage />} />
          <Route path="/daily/games" element={<MiniGamesDashboardPage />} />
          <Route path="/daily/derby" element={<HomeRunDerbyPage />} />
          <Route path="/daily/passer" element={<PocketPasserPage />} />
          <Route path="/daily/flick" element={<FlickToScorePage />} />
          <Route path="/rank" element={<RankPage />} />
          <Route path="/store" element={<StorePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin/featured" element={<AdminFeaturedPage />} />
          <Route path="/contribute" element={<ContributePage />} />
        </Route>
        <Route
          path="*"
          element={
            <div className="p-8 text-center" style={{ fontFamily: 'var(--db-font-ui)', color: 'var(--db-text-muted)' }}>
              Page not found
            </div>
          }
        />
      </Routes>
      </Suspense>
    </AppShell>
  )
}

export default App
