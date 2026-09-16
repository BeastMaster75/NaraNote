import { KanjiFilterBar } from '../components/KanjiFilterBar'
import { Page } from '../components/Page'
import { useUser, type Theme } from './UserContext'
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

  return (
    <Page title="Settings" subtitle="Your account and how the app behaves.">
      <div className="settings">
        <section className="setting">
          <div className="setting-copy">
            <h3 className="setting-title">Display Name</h3>
            <p className="muted small">
              What the app calls you. There are no accounts yet, so this is local to
              this install.
            </p>
          </div>
          <div className="setting-control">
            <input
              key={me.displayName}
              className="setting-input"
              defaultValue={me.displayName}
              maxLength={80}
              onBlur={(event) => commitName(event.currentTarget)}
              onKeyDown={(event) =>
                event.key === 'Enter' && commitName(event.currentTarget)
              }
              aria-label="Display name"
            />
          </div>
        </section>

        <section className="setting">
          <div className="setting-copy">
            <h3 className="setting-title">Theme</h3>
            <p className="muted small">
              System follows whatever your device is set to, and changes with it.
            </p>
          </div>
          <div className="setting-control">
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
          </div>
        </section>

        <section className="setting">
          <div className="setting-copy">
            <h3 className="setting-title">Furigana by Default</h3>
            <p className="muted small">
              Whether readings start switched on when you analyse a passage. You can
              still toggle them per passage.
            </p>
          </div>
          <div className="setting-control">
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
          </div>
        </section>

        <section className="setting">
          <div className="setting-copy">
            <h3 className="setting-title">JLPT Level</h3>
            <p className="muted small">
              Caps the words the Reading deck auto-generates from your kanji to this level
              and easier — words with a harder or unrated kanji aren&rsquo;t created. Doesn&rsquo;t
              affect words you save yourself while mining.
            </p>
          </div>
          <div className="setting-control">
            <KanjiFilterBar
              jlptLevel={me.targetJlptLevel || null}
              onJlptLevelChange={(level) => save({ targetJlptLevel: level ?? 0 })}
            />
          </div>
        </section>

        <section className="setting">
          <div className="setting-copy">
            <h3 className="setting-title">Session Length</h3>
            <p className="muted small">
              How many cards a review or handwriting session pulls at once. Shorter
              sessions are easier to actually finish.
            </p>
          </div>
          <div className="setting-control setting-control-range">
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
        </section>

        <section id="credits" className="card credits-block">
          <h3 className="setting-title">Data Credits</h3>
          <p className="muted small">
            NaraNote is built on free, community-maintained Japanese reference data. Every page
            that uses it links back here rather than repeating this in full.
          </p>
          <ul className="credits-list">
            {CREDITS.map((source) => (
              <li key={source.name}>
                <a href={source.href}>{source.name}</a>
                <span className="muted small"> — {source.body} {source.license}.</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Page>
  )
}
