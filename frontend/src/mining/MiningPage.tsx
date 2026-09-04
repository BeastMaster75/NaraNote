import { useState } from 'react'
import { Link } from 'react-router'
import { Page } from '../components/Page'
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

type Selection = { token: Token; sentence: string }

const SAMPLE =
  'その古い家の窓から、山吹色の光が漏れていた。彼は毎朝六時に起きて、川沿いを走ることにしている。'

/** Ruby over kana is noise — only annotate a word that actually contains kanji. */
function hasKanji(text: string) {
  return /[㐀-鿿]/.test(text)
}

function sentenceText(sentence: Sentence) {
  return sentence.tokens.map((token) => token.surface).join('')
}

export function MiningPage() {
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  const [result, setResult] = useState<AnalyzeResponse | null>(null)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [furigana, setFurigana] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function analyze(input: string) {
    if (!input.trim()) return
    setBusy(true)
    setError(null)
    setSelection(null)
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

  async function save(token: Token, sentence: string, meaning: string, entry: Entry | null) {
    setBusy(true)
    try {
      const response = await fetch('/api/vocab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: token.baseForm,
          reading: token.reading,
          meaning,
          dictEntryId: entry?.id ?? null,
          sentence,
          source: source.trim() || null,
        }),
      })
      if (!response.ok) throw new Error(String(response.status))
      // Re-analyse so the dimming and the comprehension figure both catch up.
      await analyze(text)
    } catch {
      setError('Couldn’t save that word.')
      setBusy(false)
    }
  }

  const comprehension =
    result && result.contentWords > 0
      ? Math.round((result.known / result.contentWords) * 100)
      : null

  return (
    <Page title="Mine" subtitle="Paste Japanese you have read and pull the words out of it.">
      <div className="mining">
        <section className="mining-input">
          <textarea
            className="mining-textarea jp"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="日本語をここに貼り付けてください"
            rows={8}
            aria-label="Japanese text to analyse"
          />
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
              Analyse
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setText('')
                setResult(null)
                setSelection(null)
              }}
              disabled={busy || (!text && !result)}
            >
              Clear
            </button>
            {!result && (
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
            )}
          </div>

          {result && (
            <div className="mining-stats">
              <div className="stat-bar" aria-hidden="true">
                <span
                  className="stat-known"
                  style={{ width: `${comprehension ?? 0}%` }}
                />
              </div>
              <p className="muted small">
                <strong>{comprehension}%</strong> of the words here are already in your
                collection — {result.known} known, {result.unknown} new.
              </p>
            </div>
          )}
        </section>

        <section className="mining-output">
          {error && <p className="error">{error}</p>}

          {!result && !error && (
            <p className="muted">
              Paste a paragraph and hit Analyse. Words you have already saved will appear
              dimmed, so the page shows you what is actually new.
            </p>
          )}

          {result && (
            <>
              <div className="mining-legend muted small">
                <span>
                  <span className="swatch swatch-new" /> new
                </span>
                <span>
                  <span className="swatch swatch-known" /> saved
                </span>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setFurigana(!furigana)}
                >
                  Furigana: {furigana ? 'On' : 'Off'}
                </button>
              </div>

              <div className="sentences">
                {result.sentences.map((sentence, index) => (
                  <p key={index} className="sentence jp jp-ruby">
                    {sentence.tokens.map((token, tokenIndex) => {
                      if (!token.content) {
                        return (
                          <span key={tokenIndex} className="tok tok-grammar">
                            {token.surface}
                          </span>
                        )
                      }
                      const isSelected =
                        selection?.token === token && selection?.sentence === sentenceText(sentence)
                      const classes = [
                        'tok',
                        'tok-word',
                        token.saved && 'is-saved',
                        isSelected && 'is-selected',
                      ]
                        .filter(Boolean)
                        .join(' ')
                      return (
                        <button
                          key={tokenIndex}
                          type="button"
                          className={classes}
                          onClick={() =>
                            setSelection({ token, sentence: sentenceText(sentence) })
                          }
                        >
                          {furigana && token.reading && hasKanji(token.surface) ? (
                            <ruby>
                              {token.surface}
                              <rt>{token.reading}</rt>
                            </ruby>
                          ) : (
                            token.surface
                          )}
                        </button>
                      )
                    })}
                  </p>
                ))}
              </div>

            </>
          )}
        </section>

        {/* Its own column, so on a desktop the word you clicked sits beside the
            passage instead of pushing it down the page. */}
        {selection && (
          <aside className="mining-detail">
            <WordDetail
              key={selection.token.baseForm + selection.sentence}
              token={selection.token}
              sentence={selection.sentence}
              busy={busy}
              onSave={save}
              onClose={() => setSelection(null)}
            />
          </aside>
        )}
      </div>
    </Page>
  )
}

function WordDetail({
  token,
  sentence,
  busy,
  onSave,
  onClose,
}: {
  token: Token
  sentence: string
  busy: boolean
  onSave: (token: Token, sentence: string, meaning: string, entry: Entry | null) => void
  onClose: () => void
}) {
  const first = token.entries[0] ?? null
  // Pre-filled from the top sense, but editable: JMdict offers many and usually
  // only one fits the sentence you actually met the word in.
  const [meaning, setMeaning] = useState(
    first?.senses[0]?.glosses.slice(0, 3).join('; ') ?? '',
  )
  const [entry, setEntry] = useState<Entry | null>(first)

  return (
    <section className="word-detail card">
      <header className="word-head">
        <div>
          <span className="word-term jp-lg">{token.baseForm}</span>
          {token.reading && <span className="word-reading jp-sm">{token.reading}</span>}
        </div>
        {token.saved && <span className="word-flag">Already saved</span>}
        <button type="button" className="word-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      {token.entries.length === 0 ? (
        <p className="muted small">No dictionary entry for this word.</p>
      ) : (
        <ul className="entries">
          {token.entries.map((candidate) => (
            <li key={candidate.id}>
              <button
                type="button"
                className={`entry${entry?.id === candidate.id ? ' is-chosen' : ''}`}
                onClick={() => {
                  setEntry(candidate)
                  setMeaning(candidate.senses[0]?.glosses.slice(0, 3).join('; ') ?? '')
                }}
              >
                <span className="entry-head">
                  <span className="jp-sm">{candidate.kanji ?? candidate.reading}</span>
                  {candidate.reading && candidate.kanji && (
                    <span className="entry-reading jp-sm">{candidate.reading}</span>
                  )}
                  {candidate.common && <span className="entry-common">common</span>}
                </span>
                <span className="entry-senses">
                  {candidate.senses.slice(0, 3).map((sense, i) => (
                    <span key={i} className="entry-sense">
                      <em>{sense.partOfSpeech.slice(0, 2).join(', ')}</em>{' '}
                      {sense.glosses.slice(0, 4).join('; ')}
                    </span>
                  ))}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className="word-field">
        <span className="kicker">Meaning to Save</span>
        <input
          className="task-input"
          value={meaning}
          onChange={(event) => setMeaning(event.target.value)}
          placeholder="What it means, in your words"
        />
      </label>

      <div className="word-context">
        <span className="kicker">Context Saved With It</span>
        <p className="jp">{sentence}</p>
      </div>

      <div className="word-actions">
        <button
          type="button"
          className="btn is-primary"
          onClick={() => onSave(token, sentence, meaning, entry)}
          disabled={busy || !meaning.trim()}
        >
          {token.saved ? 'Update' : 'Save With Sentence'}
        </button>
        <Link to="/collection" className="btn">
          See Collection
        </Link>
      </div>
    </section>
  )
}
