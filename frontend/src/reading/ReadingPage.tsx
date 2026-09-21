import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { KanjiFilterBar } from '../components/KanjiFilterBar'
import { Page } from '../components/Page'
import { useUser } from '../user/UserContext'
import './ReadingPage.css'

type BookSummary = {
  id: number
  title: string
  author: string
  jlptLevel: number | null
  charCount: number | null
}

/**
 * Where a Read session starts: a curated library suggested by JLPT level, or
 * your own text — a file upload or a straight paste. Either way it hands off
 * to {@code ReadingSession}, which does the actual analysing; nothing here
 * touches the server except to list books and extract an upload's text.
 */
export function ReadingPage() {
  const navigate = useNavigate()
  const { me } = useUser()
  const [books, setBooks] = useState<BookSummary[] | null>(null)
  const [booksError, setBooksError] = useState(false)
  const [levelOverride, setLevelOverride] = useState<number | null>(null)
  const [pasted, setPasted] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const level = levelOverride ?? (me.targetJlptLevel || null)

  useEffect(() => {
    setBooks(null)
    setBooksError(false)
    fetch(`/api/reading/books?level=${level ?? 0}`)
      .then((response) => (response.ok ? (response.json() as Promise<BookSummary[]>) : Promise.reject()))
      .then(setBooks)
      .catch(() => setBooksError(true))
  }, [level])

  function openBook(book: BookSummary) {
    navigate('/read/session', { state: { bookId: book.id, source: `${book.title} (${book.author})` } })
  }

  function openPasted() {
    if (!pasted.trim()) return
    navigate('/read/session', { state: { text: pasted, source: 'Pasted text' } })
  }

  async function upload(file: File) {
    setUploading(true)
    setUploadError(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const response = await fetch('/api/reading/extract', { method: 'POST', body: form })
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { message?: string } | null
        throw new Error(body?.message || `Couldn't read that file (${response.status}).`)
      }
      const data = (await response.json()) as { text: string }
      navigate('/read/session', { state: { text: data.text, source: file.name } })
    } catch (error) {
      setUploadError(error instanceof Error ? error.message : "Couldn't read that file.")
    } finally {
      setUploading(false)
    }
  }

  return (
    <Page title="Read" subtitle="Read a passage aloud and see how it went.">
      <div className="reading-picker">
        <section className="card reading-custom">
          <h3 className="kicker">Bring Your Own</h3>
          <p className="muted small">
            Upload a .txt, .pdf or .epub file, or paste text directly — analysed for this
            session only, never saved on the server.
          </p>

          <div className="reading-custom-row">
            <input
              type="file"
              accept=".txt,.pdf,.epub"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void upload(file)
                event.target.value = ''
              }}
              aria-label="Upload a file to read"
            />
            {uploading && <span className="muted small">Reading file&hellip;</span>}
          </div>
          {uploadError && <p className="error small">{uploadError}</p>}

          <textarea
            className="reading-paste"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="または、日本語をここに貼り付けてください"
            aria-label="Paste Japanese text to read"
          />
          <button
            type="button"
            className="btn is-primary"
            onClick={openPasted}
            disabled={!pasted.trim()}
          >
            Read This
          </button>
        </section>

        <section className="card reading-library">
          <header className="reading-library-head">
            <h3 className="kicker">From Aozora Bunko</h3>
            <KanjiFilterBar jlptLevel={level} onJlptLevelChange={setLevelOverride} />
          </header>

          {me.targetJlptLevel === 0 && levelOverride === null && (
            <p className="muted small">
              Set a JLPT level in Settings to get suggestions matched to it, or pick a level
              above.
            </p>
          )}

          {booksError && <p className="error small">Couldn&rsquo;t reach the server.</p>}

          {books === null ? (
            <p className="muted small">Loading&hellip;</p>
          ) : books.length === 0 ? (
            <p className="muted small">Nothing at this level yet — try All or a harder level.</p>
          ) : (
            <ul className="reading-book-grid">
              {books.map((book) => (
                <li key={book.id}>
                  <button type="button" className="reading-book-card" onClick={() => openBook(book)}>
                    <span className="reading-book-title jp-sm">{book.title}</span>
                    <span className="muted small">{book.author}</span>
                    <span className="muted small">
                      {book.jlptLevel ? `N${book.jlptLevel}` : 'unrated'}
                      {book.charCount ? ` · ${book.charCount.toLocaleString()} characters` : ''}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Page>
  )
}
