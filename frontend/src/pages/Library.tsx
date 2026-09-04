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

/**
 * The kanji wall.
 *
 * <p>This page used to carry a Words tab as well, duplicating a list that also
 * existed under Review. Words are managed in the deck they belong to now — a
 * word without its source is just an entry in one undifferentiated pile — and
 * Anki export moved next to each deck. What's left is the thing this page is
 * actually good at: every character you've chosen to study, at a glance.
 */
export function Library() {
  const [kanji, setKanji] = useState<KanjiEntry[] | null>(null)
  const [error, setError] = useState(false)

  const reload = useCallback(() => {
    fetch('/api/library')
      .then((r) => (r.ok ? (r.json() as Promise<KanjiEntry[]>) : Promise.reject()))
      .then(setKanji)
      .catch(() => setError(true))
  }, [])

  useEffect(reload, [reload])

  async function removeKanji(literal: string) {
    await fetch(`/api/library/${encodeURIComponent(literal)}`, { method: 'DELETE' })
    reload()
  }

  return (
    <Page
      title="Collection"
      subtitle="Every character you have chosen to study."
    >
      {error && <p className="error">Couldn&rsquo;t reach the server.</p>}

      {kanji === null ? (
        <p className="muted">Loading&hellip;</p>
      ) : kanji.length === 0 ? (
        <section className="card">
          <h3 className="kicker">No Kanji Yet</h3>
          <p className="muted">
            Find a character on the <Link to="/kanji">kanji page</Link> and add it here, or
            click a kanji inside one of your saved words. Words themselves live in their
            decks under <Link to="/review">Review</Link>.
          </p>
        </section>
      ) : (
        <>
          <p className="muted small">
            {kanji.length} {kanji.length === 1 ? 'character' : 'characters'}. Handwriting is
            scheduled under <Link to="/review">Review</Link>.
          </p>

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
        </>
      )}
    </Page>
  )
}
