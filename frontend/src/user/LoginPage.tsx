import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '../components/Page'
import { useUser } from './UserContext'
import './AuthPage.css'

export function LoginPage() {
  const { login } = useUser()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const failure = await login(email, password)
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <Page title="Log In">
      <div className="focus">
        <form className="card auth-form" onSubmit={submit}>
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
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>

          <p className="muted small">
            <Link to="/forgot-password">Forgot password?</Link>
          </p>

          {error && <p className="error small">{error}</p>}

          <button type="submit" className="btn is-primary" disabled={busy}>
            {busy ? 'Logging In…' : 'Log In'}
          </button>

          <p className="muted small">
            No account yet? <Link to="/register">Register</Link>
          </p>
        </form>
      </div>
    </Page>
  )
}
