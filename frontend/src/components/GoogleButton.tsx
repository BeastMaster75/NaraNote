import { useSite } from '../lib/site'
import { GoogleMark } from './GoogleMark'

/**
 * "Continue with Google" for the signed-out forms. A plain link, not a fetch: the whole page
 * goes to Google and comes back through GoogleAuthController. Renders nothing until the
 * server says Google is configured, so the button never appears and then vanishes.
 */
export function GoogleButton() {
  const site = useSite()
  if (!site?.googleSignIn) return null

  return (
    <>
      <a className="btn auth-google" href="/api/auth/google/start">
        <GoogleMark />
        Continue with Google
      </a>
      <p className="auth-or" aria-hidden="true">
        or
      </p>
    </>
  )
}
