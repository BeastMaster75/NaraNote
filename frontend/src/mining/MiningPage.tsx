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

async function translateApi(text: string, toJapanese: boolean) {
  const response = await fetch('/api/mining/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, toJapanese }),
  })
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(body?.message || `Translation failed (${response.status}).`)
  }
  const data = (await response.json()) as { translation: string }
  return data.translation
}

function translateErrorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : 'Couldn’t translate that.'
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
  const [translationEn, setTranslationEn] = useState('')
  // Which side the Translate button acts on — it always translates the side you
  // just typed into onto the other side, and never touches the side you're
  // actively editing. Defaults to 'ja' so an auto-seeded English side (see the
  // toggle handler) doesn't leave the button pointing at itself.
  const [lastEdited, setLastEdited] = useState<'ja' | 'en'>('ja')
  const [translating, setTranslating] = useState(false)
  const [translateError, setTranslateError] = useState<string | null>(null)
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

  // Translation never fires on its own — only the Translate button triggers a
  // request, in either direction. Analysing a passage never touches it.
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

  /** The Translate button: always translates the side you last edited onto the
   *  other side, and leaves the side you edited untouched. */
  async function translatePanel() {
    setTranslating(true)
    setTranslateError(null)
    try {
      if (lastEdited === 'en') {
        const japanese = await translateApi(translationEn, true)
        setText(japanese)
        setLastEdited('ja')
        await analyze(japanese)
      } else {
        setTranslationEn(await translateApi(text, false))
      }
    } catch (error) {
      setTranslateError(translateErrorMessage(error))
    } finally {
      setTranslating(false)
    }
  }


  // Kanji coverage, not word coverage: the page is about characters now, and a
  // word-based figure would report on a collection you no longer add to here.
  const passageKanji = result ? kanjiIn(result.sentences.map(sentenceText).join('')) : []
  const knownKanji = passageKanji.filter((char) => library.has(char)).length
  const coverage =
    passageKanji.length > 0 ? Math.round((knownKanji / passageKanji.length) * 100) : null

  const translateDisabled =
    translating || (lastEdited === 'en' ? !translationEn.trim() : !text.trim())

  return (
    <Page title="Mine" subtitle="Paste Japanese you have read and pull the words out of it.">
      <div className="mining">
        {/* One toolbar, before or after analysing — what it offers changes, but
            it never swaps the whole page shape out from under the two panes
            below, which stay put throughout. */}
        {!result ? (
          <section className="card mining-bar">
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
          </section>
        ) : (
          <section className="card mining-bar">
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
                  setTranslationEn('')
                  setTranslateError(null)
                }}
                disabled={busy}
              >
                Clear
              </button>
            </div>
          </section>
        )}

        {error && <p className="error">{error}</p>}

        {/* Japanese always on the left, English always on the right — one
            steady two-pane workspace rather than a shape that changes under
            you. The left pane is a plain textarea until you analyse, then the
            tappable/furigana view; there is no second Japanese box anywhere
            else. The right pane is translation by default, or a tapped
            kanji's detail while one is picked — closing it brings translation
            back. Nothing on the right ever requests anything on its own. */}
        <div className="mining-stage">
          <section className="mining-passage">
            {!result ? (
              <textarea
                className="mining-textarea jp"
                value={text}
                onChange={(event) => {
                  setText(event.target.value)
                  setLastEdited('ja')
                }}
                placeholder="日本語をここに貼り付けてください"
                aria-label="Japanese text to analyse"
              />
            ) : (
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
            )}
          </section>

          {kanjiPick ? (
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
          ) : (
            <aside className="mining-translation">
              <TranslationPanel
                hasKey={me.hasGeminiKey}
                english={translationEn}
                lastEdited={lastEdited}
                disabled={translateDisabled}
                onEnglishChange={(value) => {
                  setTranslationEn(value)
                  setLastEdited('en')
                }}
                translating={translating}
                error={translateError}
                onSubmit={translatePanel}
              />
            </aside>
          )}
        </div>

        <RecentlyCollected items={collected} />
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
        <button type="button" className="word-close" onClick={onClose}>
          ← Translation
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
 * The right pane by default — the Japanese side is the passage itself (see the
 * main return above), so this is the only Japanese-and-English box on the page,
 * not a second copy of one. Never fires on its own: the Translate button is the
 * only trigger, in either direction, and only fills the side you *didn't* just
 * type into. Translating English into Japanese feeds the result back into the
 * passage (see translatePanel in MiningPage) so it's immediately minable;
 * translating Japanese into English is just a read, since the passage itself
 * doesn't change.
 */
function TranslationPanel({
  hasKey,
  english,
  lastEdited,
  disabled,
  onEnglishChange,
  translating,
  error,
  onSubmit,
}: {
  hasKey: boolean
  english: string
  lastEdited: 'ja' | 'en'
  disabled: boolean
  onEnglishChange: (value: string) => void
  translating: boolean
  error: string | null
  onSubmit: () => void
}) {
  if (!hasKey) {
    return (
      <section className="word-detail card mining-translation-panel">
        <header className="word-head">
          <span className="kicker">Translation</span>
        </header>
        <p className="muted small">
          Add a Gemini API key in <Link to="/settings">Settings</Link> to translate.
        </p>
      </section>
    )
  }

  return (
    <section className="word-detail card mining-translation-panel">
      <header className="word-head">
        <span className="kicker">Translation</span>
      </header>

      <textarea
        className="mining-translation-input"
        value={english}
        onChange={(event) => onEnglishChange(event.target.value)}
        placeholder="Type English here to translate it into Japanese — or click Translate to read the passage in English."
        disabled={translating}
        aria-label="English"
      />

      {error && <p className="error small">{error}</p>}

      <div className="word-actions">
        <button type="button" className="btn is-primary" onClick={onSubmit} disabled={disabled}>
          {translating
            ? 'Translating…'
            : lastEdited === 'en'
              ? '→ 日本語'
              : '→ English'}
        </button>
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

