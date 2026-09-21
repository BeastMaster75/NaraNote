import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Page } from '../components/Page'
import { useUser } from './UserContext'
import './AuthPage.css'

export function ResetPasswordPage() {
  const { resetPassword } = useUser()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token')

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // No token in the URL at all means this wasn't reached from the emailed link — send
  // whoever landed here to request one instead of showing a form that can't work.
  if (!token) return <Navigate to="/forgot-password" replace />

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (password !== confirm) {
      setError('Those passwords don’t match.')
      return
    }
    setBusy(true)
    setError(null)
    const failure = await resetPassword(token as string, password)
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    // resetPassword() also signs every existing session out server-side, so this browser's
    // own session (if any) is gone too — send it to Log In rather than assuming it's still in.
    navigate('/login', { replace: true })
  }

  return (
    <Page title="Reset Password">
      <div className="focus">
        <form className="card auth-form" onSubmit={submit}>
          <label className="auth-field">
            <span>New Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              autoFocus
              required
            />
            <span className="muted small">At least 8 characters.</span>
          </label>
          <label className="auth-field">
            <span>Confirm Password</span>
            <input
              type="password"
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>

          {error && <p className="error small">{error}</p>}

          <button type="submit" className="btn is-primary" disabled={busy}>
            {busy ? 'Resetting…' : 'Reset Password'}
          </button>

          <p className="muted small">
            <Link to="/login">Back to Log In</Link>
          </p>
        </form>
      </div>
    </Page>
  )
}
