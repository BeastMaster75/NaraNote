import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Page } from '../components/Page'
import './KanjiLookup.css'

type KanjiResponse = {
  literal: string
  strokeCount: number | null
  grade: number | null
  jlptLevel: number | null
  frequency: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
  nanori: string[]
  radicals: string[]
  strokeOrderSvg: string | null
  yours: {
    inLibrary: boolean
    words: { term: string; reading: string | null; meaning: string; sentence: string | null }[]
    practice: {
      attempts: number
      again: number
      hard: number
      good: number
      lastAttempt: string | null
      state: string | null
      due: string | null
    } | null
    relatedInLibrary: { literal: string; shared: number }[]
  }
}

function relativeDay(iso: string) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000)
  if (days < -1) return `${Math.abs(days)} days ago`
  if (days === -1) return 'yesterday'
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  return `in ${days} days`
}

/**
 * Add or remove this character from your library. Optimistic state would be
 * wrong here — if the request fails the button must not claim it worked.
 */
function LibraryToggle({ literal, initial }: { literal: string; initial: boolean }) {
  const [inLibrary, setInLibrary] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setInLibrary(initial)
    setFailed(false)
  }, [initial, literal])

  async function toggle() {
    setBusy(true)
    setFailed(false)
    try {
      const response = await fetch(`/api/library/${encodeURIComponent(literal)}`, {
        method: inLibrary ? 'DELETE' : 'PUT',
      })
      if (!response.ok) throw new Error(String(response.status))
      setInLibrary(!inLibrary)
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="library-toggle">
      <button
        type="button"
        className={`btn${inLibrary ? ' is-in-library' : ' is-primary'}`}
        onClick={toggle}
        disabled={busy}
      >
        {inLibrary ? 'In Your Library' : 'Add to Library'}
      </button>
      {failed && <span className="error small">Couldn&rsquo;t save that.</span>}
    </div>
  )
}

// Fallbacks for a browser with no history yet. They matter: without a Japanese
// IME these are the only way into the page, so the row is padded with them
// rather than left empty.
const EXAMPLES = ['待', '山', '鬱', '語', '飲']

const RECENTS_KEY = 'naranote.recentKanji'
const CHIP_COUNT = 5

/**
 * Recently viewed characters live in localStorage rather than on the server.
 * "What I just looked at on this machine" is inherently per-device, and a
 * shortcut row isn't worth a table, an endpoint and a round trip that would
 * make the chips flicker in on every page load.
 */
function readRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string').slice(0, CHIP_COUNT)
      : []
  } catch {
    // Private browsing, or someone hand-edited the key into nonsense.
    return []
  }
}

function pushRecent(literal: string): string[] {
  const next = [literal, ...readRecents().filter((item) => item !== literal)].slice(0, CHIP_COUNT)
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* storage unavailable — the row just won't persist */
  }
  return next
}

export function KanjiLookup() {
  const { literal: param } = useParams<{ literal: string }>()
  const navigate = useNavigate()

  // Split by code point rather than char — a few CJK characters sit outside the
  // Basic Multilingual Plane and arrive as two-char surrogate pairs.
  const codePoints = param ? Array.from(param) : []
  const literal = codePoints[0] ?? ''

  // The field holds its own text rather than reading straight from the URL.
  // Binding it to the route broke Japanese input entirely: an IME composes a
  // character over several keystrokes, and navigating on each one overwrote the
  // half-finished composition.
  const [draft, setDraft] = useState(literal)
  const draftRef = useRef(draft)
  draftRef.current = draft
  const composing = useRef(false)

  const [recents, setRecents] = useState<string[]>(readRecents)

  // Stable identity so the panel's effect doesn't re-run on every render.
  const remember = useCallback((found: string) => {
    setRecents(pushRecent(found))
  }, [])

  // Your own history first, topped up with examples so the row is never empty
  // and there is always a way in without a Japanese keyboard.
  const chips = [...recents, ...EXAMPLES.filter((e) => !recents.includes(e))].slice(0, CHIP_COUNT)

  useEffect(() => {
    // Adopt the route only when it disagrees with what's typed — otherwise the
    // navigation caused by typing would immediately wipe the rest of the input.
    if ((Array.from(draftRef.current)[0] ?? '') !== literal) {
      setDraft(literal)
    }
  }, [literal])

  function commit(value: string) {
    const first = Array.from(value)[0]
    // Empty goes to /kanji, not home. Backspacing a character should leave you
    // on the page you were using, not throw you out of it.
    navigate(first ? `/kanji/${first}` : '/kanji', { replace: true })
  }

  // Keep the URL canonical: one character per kanji page. Pasting a whole word
  // into the address bar lands on its first character rather than a dead URL.
  if (codePoints.length > 1) {
    return <Navigate to={`/kanji/${literal}`} replace />
  }

  return (
    <Page title="Kanji" subtitle="Readings, meanings and stroke order for any character.">
      <section className="lookup">
        <div className="lookup-controls">
        <input
          className="lookup-input jp-lg"
          value={draft}
          onChange={(event) => {
            setDraft(event.target.value)
            // Mid-composition the value is romaji, not a character yet — wait
            // for the IME to finish before acting on it.
            if (!composing.current) {
              // Replace rather than push: typing shouldn't fill the back button
              // with every character you tried.
              commit(event.target.value)
            }
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={(event) => {
            composing.current = false
            commit(event.currentTarget.value)
          }}
          aria-label="Kanji to look up"
          placeholder="漢字"
        />
          <div className="lookup-examples">
            {chips.map((chip) => (
              <Link
                key={chip}
                to={`/kanji/${chip}`}
                className={`chip jp-sm${recents.includes(chip) ? ' is-recent' : ''}`}
              >
                {chip}
              </Link>
            ))}
          </div>
        </div>

        {literal ? (
          <KanjiPanel literal={literal} onFound={remember} />
        ) : (
          <p className="muted">Pick a kanji, or type one.</p>
        )}
      </section>
    </Page>
  )
}

function KanjiPanel({
  literal,
  onFound,
}: {
  literal: string
  /** Called only for a character that actually resolved, so a mistyped or
   *  non-existent one never lands in the recents row. */
  onFound: (literal: string) => void
}) {
  const [kanji, setKanji] = useState<KanjiResponse | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'missing' | 'error'>('loading')

  useEffect(() => {
    let cancelled = false
    setStatus('loading')

    fetch(`/api/kanji/${encodeURIComponent(literal)}`)
      .then((response) => {
        if (response.status === 404) return null
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<KanjiResponse>
      })
      .then((data) => {
        if (cancelled) return
        setKanji(data)
        setStatus(data ? 'ok' : 'missing')
        if (data) onFound(literal)
      })
      .catch(() => {
        if (!cancelled) setStatus('error')
      })

    // Guards against an earlier, slower request landing after a later one.
    return () => {
      cancelled = true
    }
  }, [literal, onFound])

  if (status === 'error') return <p className="error">Couldn&rsquo;t reach the server.</p>
  if (status === 'missing') {
    return (
      <p className="muted">
        No entry for <span className="jp">{literal}</span> in the kanji dictionary. Kana,
        punctuation and some radical-only forms aren&rsquo;t in it.
      </p>
    )
  }
  if (status === 'loading' || !kanji) return <p className="muted">Loading…</p>
  return <KanjiDetail kanji={kanji} />
}

function KanjiDetail({ kanji }: { kanji: KanjiResponse }) {
  return (
    <article className="kanji">
      <div className="kanji-hero">
        <div className="kanji-glyph">{kanji.literal}</div>
        <dl className="kanji-facts">
          <Fact label="Strokes" value={kanji.strokeCount} />
          <Fact label="Grade" value={kanji.grade} />
          <Fact label="JLPT" value={kanji.jlptLevel ? `N${kanji.jlptLevel}` : null} />
          <Fact label="Frequency" value={kanji.frequency ? `#${kanji.frequency}` : null} />
        </dl>
        <LibraryToggle literal={kanji.literal} initial={kanji.yours.inLibrary} />
      </div>

      <div className="kanji-body">
        <div className="kanji-text">
          <Section title="Meaning">
            <p className="kanji-meanings">{kanji.meanings.join(', ') || '—'}</p>
          </Section>

          <Section title="On'yomi">
            <ReadingList readings={kanji.onReadings} />
          </Section>

          <Section title="Kun'yomi">
            <ReadingList readings={kanji.kunReadings} />
          </Section>

          {kanji.radicals.length > 0 && (
            <Section title="Built From">
              <ul className="readings">
                {kanji.radicals.map((radical) => (
                  <li key={radical}>
                    {/* Many components are kanji in their own right, so they link
                        onward. A few are radical-only forms with no entry. */}
                    <Link to={`/kanji/${radical}`} className="radical jp-sm">
                      {radical}
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {kanji.nanori.length > 0 && (
            <Section title="In Names">
              <ReadingList readings={kanji.nanori} />
            </Section>
          )}
        </div>

        <div className="kanji-yours">
          <YoursPanel kanji={kanji} />
        </div>

        <div className="kanji-strokes">
          <Section title="Stroke Order">
            {kanji.strokeOrderSvg ? (
              // Trusted content: these SVGs come from our own import of KanjiVG,
              // not from anything a user supplied.
              <div
                className="stroke-order"
                dangerouslySetInnerHTML={{ __html: kanji.strokeOrderSvg }}
              />
            ) : (
              <p className="muted small">No diagram for this character.</p>
            )}
          </Section>
        </div>
      </div>
    </article>
  )
}

/**
 * What's true of you rather than of the character. Reference pages elsewhere
 * already show the dictionary; this is the half only this app can show.
 */
function YoursPanel({ kanji }: { kanji: KanjiResponse }) {
  const { words, practice, relatedInLibrary, inLibrary } = kanji.yours
  const nothingYet = words.length === 0 && !practice && relatedInLibrary.length === 0

  if (nothingYet) {
    return (
      <Section title="Yours">
        <p className="muted small">
          {inLibrary
            ? 'In your library, but you haven’t practised it or met it in a saved word yet.'
            : 'Nothing yet. Add it to your library to practise writing it, or save a word containing it from Mine.'}
        </p>
      </Section>
    )
  }

  return (
    <>
      {practice && (
        <Section title="Your Practice">
          <div className="practice-tally">
            <span className="tally">
              <strong>{practice.attempts}</strong> written
            </span>
            {practice.again > 0 && (
              <span className="tally is-again">
                <strong>{practice.again}</strong> failed
              </span>
            )}
            {practice.hard > 0 && (
              <span className="tally is-hard">
                <strong>{practice.hard}</strong> hard
              </span>
            )}
            {practice.good > 0 && (
              <span className="tally is-good">
                <strong>{practice.good}</strong> right
              </span>
            )}
          </div>
          <p className="muted small">
            {practice.due
              ? `Next up ${relativeDay(practice.due)}.`
              : 'No longer scheduled — it isn’t in your library.'}
            {practice.lastAttempt && ` Last written ${relativeDay(practice.lastAttempt)}.`}
          </p>
        </Section>
      )}

      {words.length > 0 && (
        <Section title="In Your Words">
          <ul className="your-words">
            {words.map((word) => (
              <li key={word.term}>
                <span className="your-word jp-sm jp-ruby">
                  {word.reading ? (
                    <ruby>
                      {word.term}
                      <rt>{word.reading}</rt>
                    </ruby>
                  ) : (
                    word.term
                  )}
                </span>
                <span className="your-word-meaning">{word.meaning}</span>
                {word.sentence && <span className="your-word-sentence jp-sm">{word.sentence}</span>}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {relatedInLibrary.length > 0 && (
        <Section title="Shares Parts With">
          <ul className="readings">
            {relatedInLibrary.map((related) => (
              <li key={related.literal}>
                <Link
                  to={`/kanji/${related.literal}`}
                  className="radical jp-sm"
                  title={`${related.shared} component${related.shared === 1 ? '' : 's'} in common`}
                >
                  {related.literal}
                  {related.shared > 1 && <span className="shared-count">{related.shared}</span>}
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted small">Others in your library built from the same components.</p>
        </Section>
      )}
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="kanji-section">
      <h3 className="kicker">{title}</h3>
      {children}
    </div>
  )
}

function ReadingList({ readings }: { readings: string[] }) {
  if (readings.length === 0) return <p className="muted small">—</p>
  return (
    <ul className="readings">
      {readings.map((reading) => (
        <li key={reading} className="reading jp-sm">
          {reading}
        </li>
      ))}
    </ul>
  )
}

function Fact({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  )
}
