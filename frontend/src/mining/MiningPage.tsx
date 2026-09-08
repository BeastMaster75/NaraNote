import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Marked } from '../components/Marked'
import { Page } from '../components/Page'
import { useUser } from '../user/UserContext'
import './MiningPage.css'

type Sense = { partOfSpeech: string[]; glosses: string[] }
type Entry = {
  id: string
  common: boolean
  kanji: string | null
  reading: string | null
  senses: Sense[]
}
type Token = {
  surface: string
  reading: string | null
  baseForm: string
  content: boolean
  saved: boolean
  entries: Entry[]
}
type Sentence = { tokens: Token[] }
type AnalyzeResponse = {
  sentences: Sentence[]
  contentWords: number
  known: number
  unknown: number
}

/**
 * Words are still parsed — they carry the readings that furigana needs, and the
 * word boundaries that make a passage readable — but they are no longer
 * something you save. The collection is kanji. The `/api/vocab` endpoints stay
 * on the server, unused by this page.
 */

/** A character already in the collection, as /api/library returns it. */
type Collected = {
  literal: string
  meanings: string[]
  addedAt: string
}

/**
 * Enough to show the page has a history without turning the landing state into
 * the collection page — that already exists, and this is a link to it.
 */
const RECENT_LIMIT = 8

const SAMPLE =
  'その古い家の窓から、山吹色の光が漏れていた。彼は毎朝六時に起きて、川沿いを走ることにしている。'

/** Ruby over kana is noise — only annotate a word that actually contains kanji. */
function hasKanji(text: string) {
  return /[㐀-鿿]/.test(text)
}

type KanjiPick = { literal: string; sentence: string }

/** Every distinct kanji in a passage, in the order it first appears. */
function kanjiIn(text: string) {
  return [...new Set([...text].filter(hasKanji))]
}

function sentenceText(sentence: Sentence) {
  return sentence.tokens.map((token) => token.surface).join('')
}

/** What the home page's paste box hands over when it navigates here. */
type HandOff = { text?: string; source?: string | null }

export function MiningPage() {
  const { me } = useUser()
  const handOff = useLocation().state as HandOff | null
  const [text, setText] = useState(handOff?.text ?? '')
  const [source, setSource] = useState(handOff?.source ?? '')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  // Null means "use whatever the setting says". A plain useState seeded from the
  // setting would freeze at the default, because /api/me answers after mount and
  // an initial value is only ever read once.
  const [furiganaOverride, setFuriganaOverride] = useState<boolean | null>(null)
  const furigana = furiganaOverride ?? me.furigana
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [kanjiPick, setKanjiPick] = useState<KanjiPick | null>(null)
  // The characters you already study — one fetch serving two jobs: the passage
  // reads as a diff against it, and the landing state shows it back to you.
  const [collected, setCollected] = useState<Collected[] | null>(null)
  const library = new Set((collected ?? []).map((entry) => entry.literal))

  const loadLibrary = useCallback(() => {
    fetch('/api/library')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<Collected[]>
      })
      .then(setCollected)
      .catch(() => setCollected([]))
  }, [])

  useEffect(loadLibrary, [loadLibrary])

  // Arriving with text already in hand means the user has pressed Mine It on the
  // home page — analysing it here saves them pressing Analyse straight away.
  // Ref-guarded so it fires once, not on every later render.
  const analysed = useRef(false)
  useEffect(() => {
    if (analysed.current || !handOff?.text) return
    analysed.current = true
    void analyze(handOff.text)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function analyze(input: string) {
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    setKanjiPick(null)
    try {
      const response = await fetch('/api/mining/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: input }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setResult((await response.json()) as AnalyzeResponse)
    } catch {
      setError('Couldn’t analyse that.')
    } finally {
      setBusy(false)
    }
  }


  // Kanji coverage, not word coverage: the page is about characters now, and a
  // word-based figure would report on a collection you no longer add to here.
  const passageKanji = result ? kanjiIn(result.sentences.map(sentenceText).join('')) : []
  const knownKanji = passageKanji.filter((char) => library.has(char)).length
  const coverage =
    passageKanji.length > 0 ? Math.round((knownKanji / passageKanji.length) * 100) : null

  return (
    <Page title="Mine" subtitle="Paste Japanese you have read and pull the words out of it.">
      <div className="mining">
        {/* Before you analyse, the box IS the page — a narrow column of textarea
            beside an empty void was the old shape, and it read as unfinished.
            After analysing it collapses, because then the passage is the page. */}
        {!result ? (
          <section className="card mining-box">
            <textarea
              className="mining-textarea jp"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="日本語をここに貼り付けてください"
              rows={10}
              aria-label="Japanese text to analyse"
            />
            <div className="mining-controls">
              <input
                className="mining-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Where it's from (optional)"
                aria-label="Source"
              />
              <div className="mining-actions">
                <button
                  type="button"
                  className="btn is-primary"
                  onClick={() => analyze(text)}
                  disabled={busy || !text.trim()}
                >
                  {busy ? 'Reading…' : 'Analyse'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => {
                    setText(SAMPLE)
                    analyze(SAMPLE)
                  }}
                  disabled={busy}
                >
                  Try an Example
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="card mining-bar">
            {/* No excerpt of the passage here: it used to truncate what you'd
                pasted to one clipped line, directly above the full text. */}
            <div className="mining-stats">
              <div className="stat-bar" aria-hidden="true">
                <span className="stat-known" style={{ width: `${coverage ?? 0}%` }} />
              </div>
              <p className="muted small">
                <strong>{knownKanji}</strong> of {passageKanji.length} kanji here are already
                yours.
              </p>
            </div>
            <div className="mining-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setFuriganaOverride(!furigana)}
              >
                Furigana: {furigana ? 'On' : 'Off'}
              </button>
              <button type="button" className="btn" onClick={() => setResult(null)}>
                Edit Text
              </button>
              <button
                type="button"
                className="btn"
                onClick={() => {
                  setText('')
                  setResult(null)
                  setKanjiPick(null)
                }}
                disabled={busy}
              >
                Clear
              </button>
            </div>
          </section>
        )}

        {error && <p className="error">{error}</p>}

        {result ? (
          <div className="mining-stage">
            <section className="mining-passage">
              <div className="mining-legend muted small">
                <span>
                  <span className="swatch swatch-new" /> not yours yet — tap to file this
                  sentence under it
                </span>
                <span>
                  <span className="swatch swatch-known" /> already in your collection
                </span>
              </div>

              <div className="sentences">
                {result.sentences.map((sentence, index) => {
                  const whole = sentenceText(sentence)
                  return (
                    <p key={index} className="sentence jp jp-ruby">
                      {sentence.tokens.map((token, tokenIndex) => {
                        // Characters are the targets, but the word still owns the
                        // reading — so the targets go *inside* the ruby base
                        // rather than replacing it. That keeps furigana while
                        // making each kanji individually tappable.
                        const chars = [...token.surface].map((char, charIndex) =>
                          hasKanji(char) ? (
                            <button
                              key={charIndex}
                              type="button"
                              className={[
                                'tok',
                                'tok-kanji',
                                library.has(char) && 'is-known',
                                kanjiPick?.literal === char &&
                                  kanjiPick?.sentence === whole &&
                                  'is-selected',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              onClick={() => setKanjiPick({ literal: char, sentence: whole })}
                            >
                              {char}
                            </button>
                          ) : (
                            <span
                              key={charIndex}
                              className={token.content ? undefined : 'tok tok-grammar'}
                            >
                              {char}
                            </span>
                          ),
                        )

                        return furigana && token.reading && hasKanji(token.surface) ? (
                          <ruby key={tokenIndex}>
                            {chars}
                            <rt>{token.reading}</rt>
                          </ruby>
                        ) : (
                          <span key={tokenIndex}>{chars}</span>
                        )
                      })}
                    </p>
                  )
                })}
              </div>
            </section>

            {/* Its own column, so on a desktop what you clicked sits beside the
                passage instead of pushing it down the page. */}
            {kanjiPick && (
              <aside className="mining-detail">
                <KanjiPickDetail
                  key={kanjiPick.literal + kanjiPick.sentence}
                  literal={kanjiPick.literal}
                  sentence={kanjiPick.sentence}
                  source={source}
                  alreadyYours={library.has(kanjiPick.literal)}
                  onFiled={loadLibrary}
                  onClose={() => setKanjiPick(null)}
                />
              </aside>
            )}
          </div>
        ) : (
          <RecentlyCollected items={collected} />
        )}
      </div>
    </Page>
  )
}

/**
 * The kanji-first half of mining: one character out of the passage, and the
 * sentence you met it in, filed together. Adding it to the collection is part of
 * the same action rather than a second errand — the character is only worth
 * collecting because of where you found it.
 */
function KanjiPickDetail({
  literal,
  sentence,
  source,
  alreadyYours,
  onFiled,
  onClose,
}: {
  literal: string
  sentence: string
  source: string
  alreadyYours: boolean
  onFiled: () => void
  onClose: () => void
}) {
  const [kanji, setKanji] = useState<{
    meanings: string[]
    onReadings: string[]
    kunReadings: string[]
    strokeCount: number | null
  } | null>(null)
  const [filed, setFiled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/kanji/${encodeURIComponent(literal)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setKanji)
      .catch(() => setKanji(null))
  }, [literal])

  async function file() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/kanji/${encodeURIComponent(literal)}/sentences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence, source: source.trim() || null }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setFiled(true)
      // So the passage behind this panel dims the character straight away.
      onFiled()
    } catch {
      setError('Couldn’t file that sentence.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="word-detail card">
      <header className="word-head">
        <div>
          <span className="word-term jp-lg">{literal}</span>
        </div>
        <button type="button" className="word-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {kanji === null ? (
        <p className="muted small">Looking it up…</p>
      ) : (
        <>
          <p className="pick-meaning">{kanji.meanings.slice(0, 4).join(', ') || '—'}</p>
          <p className="muted small">
            {kanji.onReadings.join('・') || '—'} / {kanji.kunReadings.join('・') || '—'} ·{' '}
            {kanji.strokeCount ?? '—'} strokes
            {alreadyYours && ' · already in your collection'}
          </p>
        </>
      )}

      <div className="word-context">
        <span className="kicker">Sentence to File</span>
        <p className="jp">
          <Marked text={sentence} needle={literal} />
        </p>
      </div>

      {error && <p className="error small">{error}</p>}

      <div className="word-actions">
        {filed ? (
          <>
            <span className="pick-done small">Filed under {literal}</span>
            <Link to={`/collection/${encodeURIComponent(literal)}`} className="btn">
              See {literal}
            </Link>
          </>
        ) : (
          <button
            type="button"
            className="btn is-primary"
            onClick={file}
            disabled={busy || kanji === null}
          >
            {busy
              ? 'Filing…'
              : alreadyYours
                ? `File This Sentence Under ${literal}`
                : `Add ${literal} With This Sentence`}
          </button>
        )}
      </div>
    </section>
  )
}

/**
 * What the page is for, shown as what it has produced. An empty paste box says
 * nothing about why you'd fill it; a wall of sentences you pulled out of things
 * you were reading says exactly that.
 */
function RecentlyCollected({ items }: { items: Collected[] | null }) {
  if (items === null) {
    return <p className="muted">Loading…</p>
  }

  if (items.length === 0) {
    return (
      <section className="mining-recent">
        <h3 className="kicker">Nothing Collected Yet</h3>
        <p className="muted mining-firstrun">
          Paste a paragraph from whatever you&rsquo;re reading and hit Analyse. Kanji you
          already have come back dimmed, so what stands out is what&rsquo;s new. Tap one and
          the sentence you met it in is filed under it — which is what you&rsquo;ll see when
          you practise writing it.
        </p>
      </section>
    )
  }

  return (
    <section className="mining-recent">
      <h3 className="kicker">Recently Collected</h3>
      <ol className="mining-collected-list">
        {items.slice(0, RECENT_LIMIT).map((item) => (
          <li key={item.literal}>
            <Link
              to={`/collection/${encodeURIComponent(item.literal)}`}
              className="card mining-collected-card"
            >
              <span className="mining-collected-glyph">{item.literal}</span>
              <span className="mining-collected-meaning small">
                {item.meanings.slice(0, 2).join(', ') || '—'}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      <p className="muted small">
        <Link to="/collection">See the whole collection</Link>
      </p>
    </section>
  )
}

