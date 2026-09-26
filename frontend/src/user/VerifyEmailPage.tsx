import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { AuthShell } from '../components/AuthShell'
import { useUser } from './UserContext'
import './AuthPage.css'

/**
 * Reached two ways, sharing one page: right after registering (no `token` —
 * show "check your inbox") or from the link that email contains
 * (`?token=...` — verify immediately and drop the user into the app).
 */
export function VerifyEmailPage() {
  const { me, status, verifyEmail, resendVerification, logout } = useUser()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const attempted = useRef(false)

  const [verifying, setVerifying] = useState(Boolean(token))
  // Verified from a browser that isn't signed in: nothing to drop them into, so say so.
  const [confirmedSignedOut, setConfirmedSignedOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    verifyEmail(token).then(async (failure) => {
      if (failure) {
        setVerifying(false)
        setError(failure)
        return
      }
      // Asked directly rather than read from context state, which may not have re-rendered yet.
      const signedIn = await fetch('/api/me')
        .then((response) => response.ok)
        .catch(() => false)
      if (signedIn) {
        navigate('/', { replace: true })
      } else {
        setVerifying(false)
        setConfirmedSignedOut(true)
      }
    })
  }, [token, verifyEmail, navigate])

  if (!token && status === 'loading') return null
  if (!token && status === 'anonymous') return <Navigate to="/welcome" replace />
  // Already verified and no link was clicked just now (e.g. this tab was left open on
  // "check your inbox" while the link was opened elsewhere), or a guest with no address to
  // verify — nothing left to do here.
  if (!token && (me.emailVerified || me.email === null)) return <Navigate to="/" replace />

  if (confirmedSignedOut) {
    return (
      <AuthShell title="Email Confirmed">
        <div className="card auth-form">
          <p>Your collection is saved to your account. Log in to open it on this device.</p>
          <Link to="/login" className="btn is-primary">
            Log In
          </Link>
        </div>
      </AuthShell>
    )
  }

  async function handleResend() {
    setResendState('sending')
    setError(null)
    const failure = await resendVerification()
    if (failure) {
      setError(failure)
      setResendState('idle')
    } else {
      setResendState('sent')
    }
  }

  return (
    <AuthShell title="Verify Your Email">
      <div className="card auth-form">
        {verifying ? (
          <p className="muted">Verifying your email…</p>
        ) : (
          <>
            <p>
              We sent a verification link to <strong>{me.email}</strong>. Open it to
              activate your account — the link is good for 24 hours.
            </p>

            {error && <p className="error small">{error}</p>}

            <button
              type="button"
              className="btn is-primary"
              onClick={handleResend}
              disabled={resendState === 'sending'}
            >
              {resendState === 'sending'
                ? 'Sending…'
                : resendState === 'sent'
                  ? 'Email Sent'
                  : 'Resend Email'}
            </button>

            <p className="muted small">
              Wrong account?{' '}
              <button type="button" className="link-button" onClick={() => void logout()}>
                Log Out
              </button>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  )
}
