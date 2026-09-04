import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '../components/Page'
import { downloadFile } from '../lib/download'
import './ReviewHub.css'

export type Deck = {
  /** Opaque — pass it back, don't rebuild it. See DeckRef on the server. */
  id: string
  name: string
  kind: 'WORDS' | 'KANJI'
  total: number
  due: number
  unseen: number
}

export function ReviewHub() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [error, setError] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)

  const load = useCallback(() => {
    setError(false)
    fetch('/api/decks')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<Deck[]>
      })
      .then(setDecks)
      .catch(() => setError(true))
  }, [])

  useEffect(load, [load])

  async function exportDeck(deck: Deck, format: 'anki' | 'csv') {
    setExporting(deck.id + format)
    setExportError(null)
    try {
      await downloadFile(
        `/api/export/${format}?deck=${encodeURIComponent(deck.id)}`,
        format === 'anki' ? 'naranote.apkg' : 'naranote-vocab.tsv',
      )
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed')
    } finally {
      setExporting(null)
    }
  }

  const wordDecks = decks?.filter((deck) => deck.kind === 'WORDS') ?? []
  // Deliberately the total across every deck, not a per-deck sum the user has to
  // add up: one queue is the point of a scheduler.
  const wordsDue = wordDecks.reduce((sum, deck) => sum + deck.due, 0)
  const kanjiDeck = decks?.find((deck) => deck.kind === 'KANJI')

  if (error) {
    return (
      <Page title="Review">
        <p className="error">Couldn&rsquo;t reach the server.</p>
      </Page>
    )
  }

  if (!decks) {
    return (
      <Page title="Review">
        <p className="muted">Loading&hellip;</p>
      </Page>
    )
  }

  if (decks.length === 0) {
    return (
      <Page title="Review" subtitle="Everything you are studying, in one place.">
        <div className="focus">
          <section className="card">
            <h3 className="kicker">Nothing to Review Yet</h3>
            <p className="muted">
              Save words from <Link to="/mine">Mine</Link>, or add a character on the{' '}
              <Link to="/kanji">kanji page</Link> to start practising handwriting. Decks
              appear here on their own, grouped by where you found the words.
            </p>
          </section>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Review" subtitle="Everything you are studying, in one place.">
      <div className="hub">
        <section className="hub-start">
          <div className="hub-start-copy">
            <h3 className="kicker">Due Now</h3>
            <p className="muted small">
              One queue across every deck. Reviewing deck by deck is how you end up with
              three decks each saying &ldquo;4 due&rdquo; and nothing done.
            </p>
          </div>

          <div className="hub-start-actions">
            <button
              type="button"
              className="btn is-primary hub-go"
              disabled={wordsDue === 0}
              onClick={() => navigate('/review/session')}
            >
              Review {wordsDue > 0 ? wordsDue : 'Words'}
              {wordsDue > 0 && <span className="hub-go-unit">due</span>}
            </button>

            {kanjiDeck && (
              <Link to="/write" className="btn hub-go">
                Write {kanjiDeck.due > 0 ? kanjiDeck.due : ''}
                {kanjiDeck.due > 0 && <span className="hub-go-unit">due</span>}
              </Link>
            )}
          </div>
        </section>

        {exportError && <p className="error small">{exportError}</p>}

        <ul className="decks">
          {decks.map((deck) => (
            <li key={deck.id} className={`deck deck-${deck.kind.toLowerCase()}`}>
              <div className="deck-main">
                <span className="deck-name">{deck.name}</span>
                <span className="deck-counts">
                  <span className="deck-count">
                    <strong>{deck.total}</strong> {deck.kind === 'KANJI' ? 'kanji' : 'words'}
                  </span>
                  {deck.due > 0 && (
                    <span className="deck-count is-due">
                      <strong>{deck.due}</strong> due
                    </span>
                  )}
                  {deck.unseen > 0 && (
                    <span className="deck-count is-unseen">
                      <strong>{deck.unseen}</strong> never studied
                    </span>
                  )}
                </span>
              </div>

              <div className="deck-actions">
                {deck.kind === 'KANJI' ? (
                  <Link to="/write" className="btn">
                    Practise
                  </Link>
                ) : (
                  <>
                    <button
                      type="button"
                      className="btn"
                      disabled={deck.due === 0}
                      onClick={() =>
                        navigate(`/review/session?deck=${encodeURIComponent(deck.id)}`)
                      }
                    >
                      Review
                    </button>
                    <Link
                      to={`/review/deck?id=${encodeURIComponent(deck.id)}`}
                      className="btn"
                    >
                      Words
                    </Link>
                    <button
                      type="button"
                      className="btn"
                      disabled={exporting !== null}
                      onClick={() => exportDeck(deck, 'anki')}
                      title="Export this deck as an Anki package"
                    >
                      {exporting === deck.id + 'anki' ? 'Building…' : 'Anki'}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>

        <p className="muted small hub-note">
          Decks are the &ldquo;where it&rsquo;s from&rdquo; you type when mining — nothing to
          create or maintain. Change a word&rsquo;s source and it moves.{' '}
          {kanjiDeck && 'Handwriting is scheduled separately, and Anki cannot check it.'}
        </p>
      </div>
    </Page>
  )
}
