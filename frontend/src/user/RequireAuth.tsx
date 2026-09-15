import { Navigate, Outlet } from 'react-router'
import { useUser } from './UserContext'

/**
 * Gates every route nested under it on a real session. Renders nothing while
 * the initial `/api/me` check is in flight — brief, and avoids a login-page
 * flash right before the redirect either way.
 */
export function RequireAuth() {
  const { status } = useUser()

  if (status === 'loading') return null
  if (status === 'anonymous') return <Navigate to="/login" replace />
  return <Outlet />
}
