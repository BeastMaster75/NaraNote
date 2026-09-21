import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'
import { Page } from '../components/Page'
import { useUser } from './UserContext'
import './AuthPage.css'

/**
 * Reached two ways, sharing one page: right after registering (no `token` —
 * show "check your inbox") or from the link that email contains
 * (`?token=...` — verify immediately and drop the user into the app).
 */
export function VerifyEmailPage() {
  const { me, verifyEmail, resendVerification, logout } = useUser()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')
  const attempted = useRef(false)

  const [verifying, setVerifying] = useState(Boolean(token))
  const [error, setError] = useState<string | null>(null)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  useEffect(() => {
    if (!token || attempted.current) return
    attempted.current = true
    verifyEmail(token).then((failure) => {
      if (failure) {
        setVerifying(false)
        setError(failure)
      } else {
        navigate('/', { replace: true })
      }
    })
  }, [token, verifyEmail, navigate])

  // Already verified and no link was clicked just now (e.g. this tab was left open on
  // "check your inbox" while the link was opened elsewhere) — nothing left to do here.
  if (!token && me.emailVerified) return <Navigate to="/" replace />

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
    <Page title="Verify Your Email">
      <div className="focus">
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
      </div>
    </Page>
  )
}
