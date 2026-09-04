import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '../components/Page'
import './Library.css'

type LibraryEntry = {
  literal: string
  strokeCount: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
  addedAt: string
}

export function Library() {
  const [entries, setEntries] = useState<LibraryEntry[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch('/api/library')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<LibraryEntry[]>
      })
      .then((data) => !cancelled && setEntries(data))
      .catch(() => !cancelled && setError(true))
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <Page
      title="Collection"
      subtitle="The kanji you have chosen to study."
    >
      {error && <p className="error">Couldn&rsquo;t reach the server.</p>}
      {!error && !entries && <p className="muted">Loading…</p>}

      {entries?.length === 0 && (
        <section className="card">
          <h3 className="kicker">Nothing Saved Yet</h3>
          <p className="muted">
            Find a character on the <Link to="/kanji">kanji page</Link> and add it here. Later,
            sentence mining will be able to add them for you.
          </p>
        </section>
      )}

      {entries && entries.length > 0 && (
        <>
          <p className="muted small">
            {entries.length} {entries.length === 1 ? 'character' : 'characters'}
          </p>
          <ul className="library-grid">
            {entries.map((entry) => (
              <li key={entry.literal}>
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
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}
