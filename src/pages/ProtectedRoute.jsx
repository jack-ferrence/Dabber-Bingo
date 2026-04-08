import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.jsx'

function ProtectedRoute() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <span style={{ fontFamily: 'var(--db-font-ui)', fontSize: 13, color: 'var(--db-text-muted)' }}>Loading...</span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}

export default ProtectedRoute
