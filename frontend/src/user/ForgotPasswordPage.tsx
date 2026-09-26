import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthShell } from '../components/AuthShell'
import { useUser } from './UserContext'
import './AuthPage.css'

export function ForgotPasswordPage() {
  const { forgotPassword } = useUser()
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const failure = await forgotPassword(email)
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    // Same confirmation regardless of whether the address has an account — see
    // UserContext.forgotPassword and AuthController.forgotPassword.
    setSent(true)
  }

  return (
    <AuthShell title="Forgot Password">
      {sent ? (
        <div className="card auth-form">
          <p>
            If an account exists for <strong>{email}</strong>, we&rsquo;ve sent a link to
            reset its password. The link is good for 1 hour.
          </p>
          <p className="muted small">
            <Link to="/login">Back to Log In</Link>
          </p>
        </div>
      ) : (
        <form className="card auth-form" onSubmit={submit}>
          <p className="muted small">
            Enter the email on your account and we&rsquo;ll send a link to reset your
            password.
          </p>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </label>

          {error && <p className="error small">{error}</p>}

          <button type="submit" className="btn is-primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send Reset Link'}
          </button>

          <p className="muted small">
            <Link to="/login">Back to Log In</Link>
          </p>
        </form>
      )}
    </AuthShell>
  )
}
