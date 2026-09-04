import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '../components/Page'
import './Library.css'

type KanjiEntry = {
  literal: string
  strokeCount: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
  addedAt: string
}

type VocabEntry = {
  id: number
  term: string
  reading: string | null
  meaning: string
  sentence: string | null
  source: string | null
  createdAt: string
}

type Tab = 'words' | 'kanji'

/** Link out any kanji inside a saved word, so a word opens into its characters. */
function LinkedTerm({ term }: { term: string }) {
  return (
    <>
      {Array.from(term).map((char, index) =>
        /[㐀-鿿]/.test(char) ? (
          <Link key={index} to={`/kanji/${char}`} className="term-kanji">
            {char}
          </Link>
        ) : (
          <span key={index}>{char}</span>
        ),
      )}
    </>
  )
}

export function Library() {
  const [tab, setTab] = useState<Tab>('words')
  const [vocab, setVocab] = useState<VocabEntry[] | null>(null)
  const [kanji, setKanji] = useState<KanjiEntry[] | null>(null)
  const [error, setError] = useState(false)

  const reload = useCallback(() => {
    fetch('/api/vocab')
      .then((r) => (r.ok ? (r.json() as Promise<VocabEntry[]>) : Promise.reject()))
      .then(setVocab)
      .catch(() => setError(true))
    fetch('/api/library')
      .then((r) => (r.ok ? (r.json() as Promise<KanjiEntry[]>) : Promise.reject()))
      .then(setKanji)
      .catch(() => setError(true))
  }, [])

  useEffect(reload, [reload])

  async function removeWord(id: number) {
    await fetch(`/api/vocab/${id}`, { method: 'DELETE' })
    reload()
  }

  async function removeKanji(literal: string) {
    await fetch(`/api/library/${encodeURIComponent(literal)}`, { method: 'DELETE' })
    reload()
  }

  return (
    <Page title="Collection" subtitle="Everything you have saved.">
      {error && <p className="error">Couldn&rsquo;t reach the server.</p>}

      <div className="collection-tabs">
        <button
          type="button"
          className={`tab${tab === 'words' ? ' is-on' : ''}`}
          onClick={() => setTab('words')}
        >
          Words {vocab && <span className="tab-count">{vocab.length}</span>}
        </button>
        <button
          type="button"
          className={`tab${tab === 'kanji' ? ' is-on' : ''}`}
          onClick={() => setTab('kanji')}
        >
          Kanji {kanji && <span className="tab-count">{kanji.length}</span>}
        </button>
      </div>

      {tab === 'words' &&
        (vocab === null ? (
          <p className="muted">Loading…</p>
        ) : vocab.length === 0 ? (
          <section className="card">
            <h3 className="kicker">No Words Yet</h3>
            <p className="muted">
              Paste something into <Link to="/mine">Mine</Link> and save the words you
              don&rsquo;t know. Each one keeps the sentence you met it in.
            </p>
          </section>
        ) : (
          <ul className="words">
            {vocab.map((word) => (
              <li key={word.id} className="word-row">
                <div className="word-main">
                  <span className="word-term-jp jp-lg">
                    <LinkedTerm term={word.term} />
                  </span>
                  {word.reading && word.reading !== word.term && (
                    <span className="word-reading-jp jp-sm">{word.reading}</span>
                  )}
                  <span className="word-meaning">{word.meaning}</span>
                </div>

                {word.sentence && (
                  <p className="word-sentence jp">
                    {word.sentence}
                    {word.source && <span className="word-source">{word.source}</span>}
                  </p>
                )}

                <button
                  type="button"
                  className="row-delete"
                  aria-label={`Remove ${word.term}`}
                  onClick={() => removeWord(word.id)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ))}

      {tab === 'kanji' &&
        (kanji === null ? (
          <p className="muted">Loading…</p>
        ) : kanji.length === 0 ? (
          <section className="card">
            <h3 className="kicker">No Kanji Yet</h3>
            <p className="muted">
              Find a character on the <Link to="/kanji">kanji page</Link> and add it here, or
              click a kanji inside one of your saved words.
            </p>
          </section>
        ) : (
          <ul className="library-grid">
            {kanji.map((entry) => (
              <li key={entry.literal} className="library-cell">
                <Link to={`/kanji/${entry.literal}`} className="library-card">
                  <span className="library-glyph">{entry.literal}</span>
                  <span className="library-meta">
                    <span className="library-meaning">
                      {entry.meanings.slice(0, 3).join(', ') || '—'}
                    </span>
                    <span className="library-readings jp-sm">
                      {[...entry.onReadings, ...entry.kunReadings].slice(0, 3).join('・') || '—'}
                    </span>
                    <span className="muted small">
                      {entry.strokeCount ? `${entry.strokeCount} strokes` : ''}
                    </span>
                  </span>
                </Link>
                <button
                  type="button"
                  className="row-delete"
                  aria-label={`Remove ${entry.literal}`}
                  onClick={() => removeKanji(entry.literal)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ))}
    </Page>
  )
}
