import type { CSSProperties, ReactNode } from 'react'
import { Logo } from './Logo'
import './AuthShell.css'

/**
 * The frame for the signed-out screens: the brand on one side, the form on the
 * other. These used to be a lone card centred on an empty page under its own
 * title — the most template-looking screen there is, and the first one anyone
 * sees. The left panel says what the app is before asking for anything.
 */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="auth-shell">
      <aside className="auth-brand">
        <div className="auth-brand-top">
          <Logo size={72} reversed label="NaraNote" />
          <span className="auth-brand-name">NaraNote</span>
        </div>

        <p className="auth-motto">
          Collect the Japanese <span className="auth-motto-mark">You Meet.</span>
        </p>

        {/* A few of the notes the app makes, as a picture of what it does. */}
        <ul className="auth-notes" aria-hidden="true">
          <li className="auth-note sticky" style={{ '--tilt': '-6deg' } as CSSProperties}>
            <span className="auth-note-term">雰囲気</span>
            <span className="sticky-caption">atmosphere</span>
          </li>
          <li
            className="auth-note sticky tone-moegi"
            style={{ '--tilt': '4deg' } as CSSProperties}
          >
            <span className="auth-note-glyph">光</span>
            <span className="sticky-caption">light</span>
          </li>
          <li
            className="auth-note sticky tone-yamabuki"
            style={{ '--tilt': '-2deg' } as CSSProperties}
          >
            <span className="auth-note-term">懐かしい</span>
            <span className="sticky-caption">nostalgic</span>
          </li>
        </ul>
      </aside>

      <main className="auth-main">
        <div className="auth-panel">
          <h2 className="auth-title">{title}</h2>
          {children}
        </div>
      </main>
    </div>
  )
}
