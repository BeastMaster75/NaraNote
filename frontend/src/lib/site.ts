import { useEffect, useState } from 'react'

/** Facts about this deployment, public before signing in — see SiteController. */
export type Site = {
  contactEmail: string | null
  /** Whether this instance has Google sign-in configured; the button is hidden otherwise. */
  googleSignIn: boolean
}

const FALLBACK: Site = { contactEmail: null, googleSignIn: false }

// Fetched once per page load: these only change when the server is redeployed.
let pending: Promise<Site> | null = null

function loadSite(): Promise<Site> {
  pending ??= fetch('/api/site')
    .then((response) => (response.ok ? (response.json() as Promise<Site>) : FALLBACK))
    .catch(() => FALLBACK)
  return pending
}

/** Null until the answer is in, so a Google button never appears and then vanishes. */
export function useSite(): Site | null {
  const [site, setSite] = useState<Site | null>(null)
  useEffect(() => {
    let live = true
    void loadSite().then((value) => live && setSite(value))
    return () => {
      live = false
    }
  }, [])
  return site
}

/**
 * Why a Google sign-in came back without signing in — the `google` query parameter
 * GoogleAuthController redirects with. Null for an unknown or absent reason.
 */
export function googleProblem(reason: string | null): string | null {
  switch (reason) {
    case 'cancelled':
      return null
    case 'failed':
      return 'Google sign-in didn’t go through. Try again.'
    case 'disabled':
      return 'Google sign-in isn’t available here.'
    case 'exists':
      return 'That Google account already has its own notebook, so nothing was changed.'
    case 'taken':
      return 'That email already has an account. Log in with its password, or pick another Google account.'
    default:
      return null
  }
}
