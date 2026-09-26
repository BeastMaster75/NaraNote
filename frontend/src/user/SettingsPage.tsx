import { useState, type FormEvent, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'
import { GoogleMark } from '../components/GoogleMark'
import { KanjiFilterBar } from '../components/KanjiFilterBar'
import { Page } from '../components/Page'
import { googleProblem, useSite } from '../lib/site'
import { useUser, type Me, type Theme } from './UserContext'
import './SettingsPage.css'

const CREDITS = [
  {
    name: 'KANJIDIC2',
    href: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project',
    body: 'Kanji meanings, readings and other reference data.',
    license: 'EDRDG, CC BY-SA 4.0',
  },
  {
    name: 'KanjiVG',
    href: 'https://kanjivg.tagaini.net/',
    body: 'Stroke-order diagrams.',
    license: '© Ulrich Apel, CC BY-SA 3.0',
  },
  {
    name: 'JMdict',
    href: 'https://www.edrdg.org/wiki/index.php/JMdict-EDICT_Dictionary_Project',
    body: 'Word entries, readings and meanings used across mining, lookup and the Reading deck.',
    license: 'EDRDG, CC BY-SA 4.0',
  },
  {
    name: 'kanji-data',
    href: 'https://github.com/davidluzgouveia/kanji-data',
    body: 'Modern N1–N5 JLPT levels, built on Jonathan Waller’s JLPT resources.',
    license: 'David Gouveia, MIT',
  },
  {
    name: 'VOICEVOX:四国めたん',
    href: 'https://voicevox.hiroshiba.jp/',
    body: 'Word-reading audio in Review, generated and cached server-side.',
    license: 'VOICEVOX',
  },
]

const THEMES: { value: Theme; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

/**
 * A labelled control inside a group. The hint is a few words, not a paragraph:
 * the reasoning behind a setting belongs in the code, not in front of the user.
 */
function Row({
  title,
  hint,
  stacked,
  children,
}: {
  title: string
  hint?: ReactNode
  /** Control under the label rather than beside it, for controls wider than half a card. */
  stacked?: boolean
  children?: ReactNode
}) {
  return (
    <div className={`setting${stacked ? ' is-stacked' : ''}`}>
      <div className="setting-copy">
        <h4 className="setting-title">{title}</h4>
        {hint && <p className="muted small">{hint}</p>}
      </div>
      {children && <div className="setting-control">{children}</div>}
    </div>
  )
}

function Group({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section className="card setting-group" id={id}>
      <h3 className="kicker">{title}</h3>
      {children}
    </section>
  )
}

/**
 * Email + password, routed entirely through the same mailed-link flow the "Forgot
 * password?" screen uses (see UserContext.forgotPassword) rather than a current-password
 * form — one flow to secure and test instead of two, and it works from Settings exactly
 * the way it works from a locked-out login screen.
 */
function AccountRows({ me }: { me: Me }) {
  const { resendVerification, forgotPassword } = useUser()
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [resetState, setResetState] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function handleResend() {
    setResendState('sending')
    await resendVerification()
    setResendState('sent')
  }

  async function handleChangePassword() {
    if (!me.email) return
    setResetState('sending')
    await forgotPassword(me.email)
    setResetState('sent')
  }

  return (
    <>
      <Row title="Email" hint={me.emailVerified ? me.email : `${me.email} — not verified yet`}>
        {!me.emailVerified && (
          <button
            type="button"
            className="btn"
            onClick={handleResend}
            disabled={resendState !== 'idle'}
          >
            {resendState === 'idle'
              ? 'Resend Verification'
              : resendState === 'sending'
                ? 'Sending…'
                : 'Sent'}
          </button>
        )}
      </Row>
      {/* An ordinary button: changing a password is occasional housekeeping, and
          as the page's only solid-pink button it read as the main thing to do. An account
          that only ever used Google has no password to change (and the reset flow skips
          password-less accounts on purpose). */}
      {!me.hasPassword ? (
        <Row title="Sign-In" hint="With Google." />
      ) : (
      <Row title="Password" hint="We’ll email you a link.">
        <button
          type="button"
          className="btn"
          onClick={handleChangePassword}
          disabled={resetState !== 'idle'}
        >
          {resetState === 'idle'
            ? 'Send Reset Link'
            : resetState === 'sending'
              ? 'Sending…'
              : 'Check Your Email'}
        </button>
      </Row>
      )}
    </>
  )
}

/**
 * Where a guest turns their notebook into an account — the rail's "Save" link and the save
 * prompts land here (#save). With Google it's one click; with an email, nothing changes
 * until the link mailed there is clicked, and the guest keeps using the app meanwhile.
 */
function GuestSaveRows({ me }: { me: Me }) {
  const { saveGuest, resendVerification } = useUser()
  const site = useSite()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(() => googleProblem(searchParams.get('google')))
  const [busy, setBusy] = useState(false)
  const [changing, setChanging] = useState(false)
  const [resendState, setResendState] = useState<'idle' | 'sending' | 'sent'>('idle')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    const failure = await saveGuest(email.trim(), password)
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    setPassword('')
    setChanging(false)
    setResendState('idle')
  }

  async function resend() {
    setResendState('sending')
    const failure = await resendVerification()
    setResendState(failure ? 'idle' : 'sent')
    setError(failure)
  }

  if (me.pendingEmail && !changing) {
    return (
      <Row
        title="Check Your Inbox"
        stacked
        hint={
          <>
            Open the link sent to <strong>{me.pendingEmail}</strong> to finish saving your
            collection.
          </>
        }
      >
        <div className="setting-key">
          <button type="button" className="btn" onClick={resend} disabled={resendState !== 'idle'}>
            {resendState === 'idle' ? 'Resend Email' : resendState === 'sending' ? 'Sending…' : 'Sent'}
          </button>
          <button type="button" className="btn" onClick={() => setChanging(true)}>
            Use Another Email
          </button>
        </div>
        {error && <p className="error small">{error}</p>}
      </Row>
    )
  }

  return (
    <Row title="Save Your Collection" hint="It lives only in this browser until you do." stacked>
      <div className="save-collection">
        {site?.googleSignIn && (
          <a className="btn save-google" href="/api/auth/google/start">
            <GoogleMark />
            Save with Google
          </a>
        )}
        <form className="save-form" onSubmit={submit}>
          <input
            type="email"
            className="setting-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email"
            autoComplete="email"
            autoFocus={location.hash === '#save'}
            aria-label="Email"
            required
          />
          <input
            type="password"
            className="setting-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password, 8+ characters"
            autoComplete="new-password"
            minLength={8}
            aria-label="Password"
            required
          />
          <button type="submit" className="btn is-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </form>
        {error && <p className="error small">{error}</p>}
      </div>
    </Row>
  )
}

/**
 * Deletes everything, after a confirmation that matches what the account has: its password
 * when there is one, otherwise typing "delete" — guests and Google-only accounts have no
 * password to ask for (see AuthController.deleteAccount).
 */
function DeleteRow({ me }: { me: Me }) {
  const { deleteAccount } = useUser()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const what = me.guest ? 'Notebook' : 'Account'

  async function confirm(event: FormEvent) {
    event.preventDefault()
    if (!me.hasPassword && value.trim().toLowerCase() !== 'delete') {
      setError('Type delete to confirm.')
      return
    }
    setBusy(true)
    setError(null)
    const failure = await deleteAccount(me.hasPassword ? value : undefined)
    setBusy(false)
    if (failure) {
      setError(failure)
      return
    }
    navigate('/welcome', { replace: true })
  }

  if (!open) {
    return (
      <Row title={`Delete ${what}`} hint="Everything in it, for good.">
        <button type="button" className="btn is-danger" onClick={() => setOpen(true)}>
          Delete…
        </button>
      </Row>
    )
  }

  return (
    <Row
      title={`Delete ${what}`}
      stacked
      hint={me.hasPassword ? 'Enter your password to confirm.' : 'Type delete to confirm.'}
    >
      <form className="setting-key" onSubmit={confirm}>
        <input
          type={me.hasPassword ? 'password' : 'text'}
          className="setting-input"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError(null)
          }}
          placeholder={me.hasPassword ? 'Password' : 'delete'}
          autoComplete={me.hasPassword ? 'current-password' : 'off'}
          autoFocus
          aria-label={me.hasPassword ? 'Password' : 'Type delete to confirm'}
        />
        <button type="submit" className="btn is-danger" disabled={busy || !value}>
          {busy ? 'Deleting…' : 'Delete'}
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setOpen(false)
            setValue('')
            setError(null)
          }}
        >
          Cancel
        </button>
      </form>
      {error && <p className="error small">{error}</p>}
    </Row>
  )
}

/**
 * Explicit Save/Remove rather than the optimistic autosave every other setting here
 * uses — a credential shouldn't partially save itself mid-keystroke the way a range
 * slider's every tick does. Never shows the saved value back, only whether one exists.
 *
 * <p>Gemini because self-hosted translation was tried first, and its free model
 * mangled ordinary phrases too often to trust.
 */
function GeminiKeyRow({ hasKey }: { hasKey: boolean }) {
  const { save } = useUser()
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSave() {
    if (!draft.trim()) return
    setBusy(true)
    await save({ geminiApiKey: draft.trim() })
    setDraft('')
    setBusy(false)
  }

  async function handleRemove() {
    setBusy(true)
    await save({ geminiApiKey: '' })
    setBusy(false)
  }

  return (
    <Row
      title="Gemini API Key"
      stacked
      hint={
        <>
          For translation on Mine. {hasKey ? 'A key is saved.' : 'No key set.'} Get a free one
          at <a href="https://aistudio.google.com/apikey">aistudio.google.com</a>.
        </>
      }
    >
      <div className="setting-key">
        <input
          type="password"
          className="setting-input"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={hasKey ? 'Replace the saved key…' : 'Paste your API key…'}
          autoComplete="off"
          maxLength={200}
          aria-label="Gemini API key"
        />
        <button
          type="button"
          className="btn is-primary"
          onClick={handleSave}
          disabled={busy || !draft.trim()}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {hasKey && (
          <button type="button" className="btn" onClick={handleRemove} disabled={busy}>
            Remove
          </button>
        )}
      </div>
    </Row>
  )
}

export function SettingsPage() {
  const { me, loaded, save } = useUser()

  /**
   * Uncontrolled, and keyed on the saved name. Controlling it would mean either
   * fighting the optimistic update on every keystroke, or holding a copy in
   * state and syncing it from an effect. The key does that job: /api/me
   * answering after mount remounts the field with the real value in it.
   */
  function commitName(field: HTMLInputElement) {
    const trimmed = field.value.trim()
    if (!trimmed || trimmed === me.displayName) {
      // Blank or unchanged isn't an edit; put the saved name back rather than
      // leaving whitespace on screen looking like it was accepted.
      field.value = me.displayName
      return
    }
    void save({ displayName: trimmed })
  }

  // Two columns of grouped cards. One full-width card per setting made this the
  // tallest page in the app — 1150px, against a 720px laptop screen.
  return (
    <Page title="Settings" subtitle="Your account and how the app behaves.">
      <div className="settings">
        <div className="settings-column">
          <Group title={me.guest ? 'Guest Notebook' : 'Account'} id="save">
            <Row title="Display Name">
              <input
                key={me.displayName}
                className="setting-input"
                defaultValue={me.displayName}
                maxLength={80}
                onBlur={(event) => commitName(event.currentTarget)}
                onKeyDown={(event) => event.key === 'Enter' && commitName(event.currentTarget)}
                aria-label="Display name"
              />
            </Row>
            {me.guest ? <GuestSaveRows me={me} /> : <AccountRows me={me} />}
            <DeleteRow me={me} />
          </Group>

          <Group title="Appearance">
            <Row title="Theme" hint="System follows your device.">
              <div className="segmented" role="group" aria-label="Theme">
                {THEMES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    className={`segment${me.theme === option.value ? ' is-on' : ''}`}
                    aria-pressed={me.theme === option.value}
                    onClick={() => save({ theme: option.value })}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Row>
            <Row title="Furigana by Default" hint="When you analyse a passage.">
              <div className="segmented" role="group" aria-label="Furigana by default">
                <button
                  type="button"
                  className={`segment${me.furigana ? ' is-on' : ''}`}
                  aria-pressed={me.furigana}
                  onClick={() => save({ furigana: true })}
                >
                  On
                </button>
                <button
                  type="button"
                  className={`segment${!me.furigana ? ' is-on' : ''}`}
                  aria-pressed={!me.furigana}
                  onClick={() => save({ furigana: false })}
                >
                  Off
                </button>
              </div>
            </Row>
          </Group>
        </div>

        <div className="settings-column">
          <Group title="Study">
            {/* Caps the words the Reading deck auto-generates from your kanji;
                words you save yourself while mining are never filtered. */}
            <Row title="JLPT Level" hint="Reading deck words go up to this level." stacked>
              <KanjiFilterBar
                jlptLevel={me.targetJlptLevel || null}
                onJlptLevelChange={(level) => save({ targetJlptLevel: level ?? 0 })}
              />
            </Row>
            <Row title="Session Length" hint="Cards per review or writing session.">
              <div className="setting-range">
                <input
                  type="range"
                  min={5}
                  max={100}
                  step={5}
                  value={me.sessionSize}
                  disabled={!loaded}
                  onChange={(event) => save({ sessionSize: Number(event.target.value) })}
                  aria-label="Session length"
                />
                <span className="setting-value">{me.sessionSize}</span>
              </div>
            </Row>
          </Group>

          <Group title="Translation">
            <GeminiKeyRow hasKey={me.hasGeminiKey} />
          </Group>
        </div>

        {/* Attribution is a licence condition; the rail's Credits link lands here.
            One line under both columns — what each source provides is on hover. */}
        <section className="card settings-credits" id="credits">
          <h3 className="kicker">Data Credits</h3>
          <ul className="credits-list">
            {CREDITS.map((source) => (
              <li key={source.name} title={source.body}>
                <a href={source.href}>{source.name}</a>
                <span className="muted small"> {source.license}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  )
}
