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
  // The welcome page, not the login form: most people arriving signed out have no account,
  // and the welcome page is where they can start one — or start as a guest.
  if (status === 'anonymous') return <Navigate to="/welcome" replace />
  return <Outlet />
}
