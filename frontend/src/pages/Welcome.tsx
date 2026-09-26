import { useState, type CSSProperties, type FormEvent } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { GoogleMark } from '../components/GoogleMark'
import { Logo } from '../components/Logo'
import { googleProblem, useSite } from '../lib/site'
import { useUser } from '../user/UserContext'
import { rememberDemoKanji } from '../lib/demoKanji'
import './Welcome.css'

/**
 * The demo sentence: 昨日、古い川の近くで小さな猫を見た。 Hand-written rather than
 * fetched, because this page is public and the reading APIs are not. Each kanji is its own
 * tap target inside the ruby base, the same way the real passage keeps its furigana.
 */
const SENTENCE: { text: string; ruby?: string }[] = [
  { text: '昨日', ruby: 'きのう' },
  { text: '、' },
  { text: '古', ruby: 'ふる' },
  { text: 'い' },
  { text: '川', ruby: 'かわ' },
  { text: 'の' },
  { text: '近', ruby: 'ちか' },
  { text: 'くで' },
  { text: '小', ruby: 'ちい' },
  { text: 'さな' },
  { text: '猫', ruby: 'ねこ' },
  { text: 'を' },
  { text: '見', ruby: 'み' },
  { text: 'た。' },
]

const KANJI_COUNT = SENTENCE.filter((part) => part.ruby).reduce(
  (count, part) => count + Array.from(part.text).length,
  0,
)

const TONES = ['', 'tone-yamabuki', 'tone-moegi', 'tone-fuji']

/**
 * The first thing a signed-out visitor sees: what the app is, shown working rather than
 * described, and a way in that doesn't demand an account. Home's bento language — the
 * inverted ink tile, sticky notes, the hand-drawn underline — so the front door looks like
 * the house.
 *
 * <p>Kanji tapped in the demo come along into the new notebook: straight in with
 * "Continue as Guest", and through a Google sign-in via {@link rememberDemoKanji}.
 */
export function WelcomePage() {
  const { status, startGuest } = useUser()
  const site = useSite()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const [collected, setCollected] = useState<string[]>([])
  const [step, setStep] = useState<'choose' | 'name'>('choose')
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(() => googleProblem(searchParams.get('google')))
  const [busy, setBusy] = useState(false)

  if (status === 'loading') return null
  if (status === 'authenticated') return <Navigate to="/" replace />

  function collect(literal: string) {
    setCollected((current) => (current.includes(literal) ? current : [...current, literal]))
  }

  async function begin(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Enter a name first.')
      return
    }
    setBusy(true)
    setError(null)
    const failure = await startGuest(trimmed, collected)
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    navigate('/', { replace: true })
  }

  return (
    <div className="welcome">
      <div className="welcome-bento">
        <section className="wtile welcome-hero">
          <div className="welcome-brand">
            <Logo size={48} label="NaraNote" />
            <span className="welcome-brand-name">NaraNote</span>
          </div>
          <div className="welcome-hero-body">
          <div className="welcome-hero-copy">
            <h1 className="welcome-headline">
              Collect the{' '}
              <span className="welcome-mark">
                Japanese
                <svg viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
                  <path d="M3 9 C 50 3, 120 2, 197 7" pathLength={1} />
                </svg>
              </span>
              <br />
              You Meet.
            </h1>
            <p className="welcome-sub">
              Tap the kanji you find in what you read. Learn to write them by hand.
            </p>
          </div>

          {/* A few of the notes a collection is made of — the same picture the login
              screen shows, so the two front doors agree. */}
          <ul className="welcome-hero-notes" aria-hidden="true">
            <li className="welcome-hero-note sticky" style={{ '--tilt': '-6deg' } as CSSProperties}>
              <span className="welcome-hero-term jp">雰囲気</span>
              <span className="sticky-caption">atmosphere</span>
            </li>
            <li
              className="welcome-hero-note sticky tone-moegi"
              style={{ '--tilt': '5deg' } as CSSProperties}
            >
              <span className="welcome-hero-glyph jp">光</span>
              <span className="sticky-caption">light</span>
            </li>
            <li
              className="welcome-hero-note sticky tone-yamabuki"
              style={{ '--tilt': '-2deg' } as CSSProperties}
            >
              <span className="welcome-hero-term jp">懐かしい</span>
              <span className="sticky-caption">nostalgic</span>
            </li>
          </ul>
          </div>
        </section>

        <section className="wtile welcome-auth" aria-label="Start">
          <span className="welcome-ghost jp" aria-hidden="true">
            始
          </span>

          {step === 'choose' ? (
            <div className="welcome-auth-body">
              <h2 className="welcome-auth-title">Start Collecting</h2>
              {site?.googleSignIn && (
                <a
                  className="welcome-btn is-google"
                  href="/api/auth/google/start"
                  onClick={() => rememberDemoKanji(collected)}
                >
                  <GoogleMark />
                  Continue with Google
                </a>
              )}
              <button
                type="button"
                className="welcome-btn is-guest"
                onClick={() => {
                  setError(null)
                  setStep('name')
                }}
              >
                Continue as Guest
              </button>
              {error && <p className="welcome-error">{error}</p>}
              <p className="welcome-auth-foot">
                Have an account? <Link to="/login">Log In</Link>
              </p>
            </div>
          ) : (
            <form className="welcome-auth-body" onSubmit={begin} noValidate>
              <h2 className="welcome-auth-title">What Should We Call You?</h2>
              <input
                className="welcome-input"
                value={name}
                onChange={(event) => {
                  setName(event.target.value)
                  setError(null)
                }}
                placeholder="Your name"
                maxLength={80}
                autoComplete="given-name"
                autoFocus
                aria-label="Your name"
              />
              {error && <p className="welcome-error">{error}</p>}
              <button type="submit" className="welcome-btn is-guest" disabled={busy}>
                {busy ? 'Opening…' : 'Open My Notebook'}
              </button>
              <p className="welcome-auth-foot">
                No email needed. Make an account whenever you like.{' '}
                <button type="button" className="welcome-link" onClick={() => setStep('choose')}>
                  Back
                </button>
              </p>
            </form>
          )}
        </section>

        <section className="wtile welcome-demo" aria-label="Try it">
          <div className="welcome-tile-head">
            <h2 className="tile-title">Try It: Tap a Kanji</h2>
            <span className="welcome-count">
              {collected.length} of {KANJI_COUNT} collected
            </span>
          </div>

          <p className="welcome-sentence jp">
            {SENTENCE.map((part, index) =>
              part.ruby ? (
                <ruby key={index}>
                  {Array.from(part.text).map((literal) => (
                    <button
                      key={literal}
                      type="button"
                      className={`welcome-k${collected.includes(literal) ? ' is-collected' : ''}`}
                      onClick={() => collect(literal)}
                      aria-pressed={collected.includes(literal)}
                      aria-label={`Collect ${literal}`}
                    >
                      {literal}
                    </button>
                  ))}
                  <rt>{part.ruby}</rt>
                </ruby>
              ) : (
                <span key={index}>{part.text}</span>
              ),
            )}
          </p>

          <div className={`welcome-wall${collected.length === 0 ? ' is-empty' : ''}`}>
            {collected.map((literal, index) => (
              <span
                key={literal}
                className={`welcome-note sticky ${TONES[index % TONES.length]}`}
                style={{ '--tilt': `${(index % 2 ? 1 : -1) * (2 + (index % 3))}deg` } as CSSProperties}
              >
                <span className="jp">{literal}</span>
              </span>
            ))}
            <span className="welcome-wall-hint">
              {collected.length === 0
                ? 'Your collection starts here.'
                : 'These come with you when you start.'}
            </span>
          </div>
        </section>

        <section className="wtile welcome-write" aria-label="Handwriting">
          <h2 className="tile-title">Then Write It</h2>
          {/* 川 in a practice cell, its last stroke drawing itself: the handwriting check,
              suggested rather than demonstrated — the real one needs an account's data. */}
          <svg className="welcome-cell" viewBox="0 0 100 100" aria-hidden="true">
            <path className="welcome-cell-guide" d="M50 4V96M4 50H96" />
            <path className="welcome-stroke" d="M32 24 Q33 58 18 82" />
            <path className="welcome-stroke" d="M52 30 V70" />
            <path className="welcome-stroke is-live" d="M74 20 V86" pathLength={1} />
          </svg>
          <p className="welcome-caption">Checked stroke by stroke.</p>
        </section>
      </div>

      <p className="welcome-foot">
        <span>Free, No Ads</span>
        <span aria-hidden="true">·</span>
        <span>Reviews Built In</span>
        <span aria-hidden="true">·</span>
        <span>Exports to Anki</span>
      </p>
    </div>
  )
}
