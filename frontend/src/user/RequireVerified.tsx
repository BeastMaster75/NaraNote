import { Navigate, Outlet } from 'react-router'
import { useUser } from './UserContext'

/**
 * Gates everything nested under it on email_verified. Sits inside RequireAuth,
 * so by the time this runs `status` is already 'authenticated' and `me`
 * reflects the real account rather than the anonymous DEFAULTS.
 */
export function RequireVerified() {
  const { me } = useUser()

  if (!me.emailVerified) return <Navigate to="/verify-email" replace />
  return <Outlet />
}
