import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Marked } from '../components/Marked'
import { Page } from '../components/Page'
import './KanjiSentences.css'

type Kanji = {
  literal: string
  strokeCount: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
}

/**
 * `term` and friends are null when you filed the sentence under the character
 * yourself rather than saving a word from it — there is no word to name.
 */
type Sentence = {
  id: number | null
  sentence: string
  term: string | null
  reading: string | null
  meaning: string | null
  source: string | null
  savedAt: string
}

/**
 * One character, and every sentence you have met it in.
 *
 * <p>The counterpart to the kanji page rather than a copy of it: that page
 * answers "what is this character", this one answers "where have I seen it".
 * Dictionary detail stays one link away so the sentences aren't buried under it.
 */
export function KanjiSentences() {
  const { literal = '' } = useParams()
  const [kanji, setKanji] = useState<Kanji | null>(null)
  const [sentences, setSentences] = useState<Sentence[] | null>(null)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    if (!literal) return
    setError(false)
    const path = `/api/kanji/${encodeURIComponent(literal)}`
    Promise.all([
      fetch(path).then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Kanji>
      }),
      fetch(`${path}/sentences`).then((r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<Sentence[]>
      }),
    ])
      .then(([foundKanji, foundSentences]) => {
        setKanji(foundKanji)
        setSentences(foundSentences)
      })
      .catch(() => setError(true))
  }, [literal])

  useEffect(load, [load])

  /** Only sentences you filed yourself can be unfiled; word-derived ones go with the word. */
  async function unfile(id: number) {
    const response = await fetch(`/api/kanji/sentences/${id}`, { method: 'DELETE' })
    if (response.ok) {
      setSentences((current) => (current ?? []).filter((item) => item.id !== id))
    }
  }

  if (error) {
    return (
      <Page title="Collection">
        <p className="error">Couldn&rsquo;t load {literal}.</p>
      </Page>
    )
  }

  if (!kanji || !sentences) {
    return (
      <Page title="Collection">
        <p className="muted">Loading…</p>
      </Page>
    )
  }

  return (
    <Page>
      <div className="ks">
        <header className="card ks-head">
          <span className="ks-glyph">{kanji.literal}</span>
          <div className="ks-identity">
            <p className="ks-meaning">{kanji.meanings.slice(0, 4).join(', ')}</p>
            <dl className="ks-readings">
              <div>
                <dt>On</dt>
                <dd className="jp-sm">{kanji.onReadings.join('・') || '—'}</dd>
              </div>
              <div>
                <dt>Kun</dt>
                <dd className="jp-sm">{kanji.kunReadings.join('・') || '—'}</dd>
              </div>
              <div>
                <dt>Strokes</dt>
                <dd>{kanji.strokeCount ?? '—'}</dd>
              </div>
            </dl>
            <div className="ks-links">
              <Link className="btn" to={`/kanji/${encodeURIComponent(kanji.literal)}`}>
                Full Entry
              </Link>
              <Link className="btn" to="/write">
                Practise Writing
              </Link>
              <Link className="btn" to="/collection">
                Back to Collection
              </Link>
            </div>
          </div>
        </header>

        <section className="ks-body">
          <h3 className="kicker">
            {sentences.length === 0
              ? 'Your Sentences'
              : `Your Sentences — ${sentences.length}`}
          </h3>

          {sentences.length === 0 ? (
            <p className="muted ks-empty">
              You haven&rsquo;t saved a sentence with {kanji.literal} in it yet. Paste something
              you&rsquo;re reading on the <Link to="/mine">mining page</Link> and save a word from
              it — the sentence comes along with it, and lands here.
            </p>
          ) : (
            <ol className="ks-list">
              {sentences.map((item) => (
                <li key={item.id ?? `${item.term}-${item.savedAt}`} className="card ks-sentence">
                  <p className="jp ks-text">
                    <Marked text={item.sentence} needle={kanji.literal} />
                  </p>
                  <p className="ks-provenance small">
                    {item.term ? (
                      <>
                        <span className="jp-sm">{item.term}</span>
                        {item.reading && <span className="jp-sm muted">{item.reading}</span>}
                        <span className="muted">{item.meaning}</span>
                      </>
                    ) : (
                      <span className="muted">Filed under {kanji.literal}</span>
                    )}
                    {item.source && <span className="ks-source">{item.source}</span>}
                    {item.id !== null && (
                      <button
                        type="button"
                        className="ks-unfile"
                        onClick={() => unfile(item.id!)}
                        aria-label="Remove this sentence"
                      >
                        ×
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </Page>
  )
}
