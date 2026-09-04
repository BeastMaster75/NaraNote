import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Page } from '../components/Page'
import { downloadFile } from '../lib/download'
import type { Deck } from './ReviewHub'
import './DeckWords.css'

type VocabEntry = {
  id: number
  term: string
  reading: string | null
  meaning: string
  sentence: string | null
  source: string | null
}

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

/**
 * The words in one deck, and where they are managed.
 *
 * <p>This is where the Collection page's Words tab went. A deck is the natural
 * place to look at a word: it carries the source you met it in, so the list is
 * "everything from よつばと！" rather than one undifferentiated pile.
 *
 * <p>The deck id travels as a query parameter, not a path segment — source names
 * are free text and a slash in one would break the route.
 */
export function DeckWords() {
  const [params] = useSearchParams()
  const deckId = params.get('id') ?? ''

  const [words, setWords] = useState<VocabEntry[] | null>(null)
  const [deck, setDeck] = useState<Deck | null>(null)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(false)
    fetch(`/api/vocab?deck=${encodeURIComponent(deckId)}`)
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<VocabEntry[]>
      })
      .then(setWords)
      .catch(() => setError(true))

    // For the name and counts in the header. Cheap, and it keeps the deck's
    // identity server-owned rather than parsed back out of the id here.
    fetch('/api/decks')
      .then((response) => (response.ok ? (response.json() as Promise<Deck[]>) : []))
      .then((all) => setDeck(all.find((candidate) => candidate.id === deckId) ?? null))
      .catch(() => undefined)
  }, [deckId])

  useEffect(load, [load])

  async function removeWord(id: number) {
    await fetch(`/api/vocab/${id}`, { method: 'DELETE' })
    load()
  }

  async function exportDeck(format: 'anki' | 'csv') {
    setExporting(format)
    setExportError(null)
    try {
      await downloadFile(
        `/api/export/${format}?deck=${encodeURIComponent(deckId)}`,
        format === 'anki' ? 'naranote.apkg' : 'naranote-vocab.tsv',
      )
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  if (error) {
    return (
      <Page title="Deck">
        <p className="error">Couldn&rsquo;t reach the server.</p>
      </Page>
    )
  }

  return (
    <Page
      title={deck?.name ?? 'Deck'}
      subtitle={deck ? undefined : 'Words saved from one source.'}
    >
      <div className="deckwords">
        <div className="deckwords-bar">
          <Link to="/review" className="btn">
            ← All Decks
          </Link>

          <div className="deckwords-bar-actions">
            {deck && deck.due > 0 && (
              <Link
                to={`/review/session?deck=${encodeURIComponent(deckId)}`}
                className="btn is-primary"
              >
                Review {deck.due} Due
              </Link>
            )}
            <button
              type="button"
              className="btn"
              disabled={exporting !== null || words?.length === 0}
              onClick={() => exportDeck('anki')}
            >
              {exporting === 'anki' ? 'Building…' : 'Anki Deck'}
            </button>
            <button
              type="button"
              className="btn"
              disabled={exporting !== null || words?.length === 0}
              onClick={() => exportDeck('csv')}
            >
              Plain Text
            </button>
          </div>
        </div>

        {exportError && <p className="error small">{exportError}</p>}

        {words === null ? (
          <p className="muted">Loading&hellip;</p>
        ) : words.length === 0 ? (
          <section className="card">
            <h3 className="kicker">No Words Here</h3>
            <p className="muted">
              This deck is empty. Save words from <Link to="/mine">Mine</Link> with this
              source to fill it.
            </p>
          </section>
        ) : (
          <ul className="words">
            {words.map((word) => (
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

                {word.sentence && <p className="word-sentence jp">{word.sentence}</p>}

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
        )}
      </div>
    </Page>
  )
}
