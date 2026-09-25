import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Page } from '../components/Page'
import './ReadingPage.css'

const ACCEPT = '.txt,.pdf,.epub'

/**
 * Where a Read session starts: your own text, either a file or a straight paste.
 * Hands off to {@code ReadingSession}, which does the actual analysing. Nothing
 * here is saved on the server — the text lives for the session only.
 */
export function ReadingPage() {
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pasted, setPasted] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

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
      <div className="reading-start">
        {/* A real drop target rather than the browser's own "Choose File"
            control, which rendered as an unstyled grey button — the one piece of
            the app that looked unfinished. The hidden input still does the
            picking, so keyboard and screen-reader use are unchanged. */}
        <section
          className={`card reading-drop${dragging ? ' is-dragging' : ''}${uploading ? ' is-busy' : ''}`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            const file = event.dataTransfer.files?.[0]
            if (file && !uploading) void upload(file)
          }}
        >
          <svg
            className="reading-drop-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M12 18v-6 M9.5 14.5 12 12l2.5 2.5" />
          </svg>
          <h3 className="reading-drop-title">
            {uploading ? 'Reading your file…' : 'Drop a File Here'}
          </h3>
          <p className="muted small">A .txt, .pdf or .epub</p>
          <button
            type="button"
            className="btn"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            Choose a File
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.target.value = ''
            }}
            aria-label="Upload a file to read"
          />
          {uploadError && <p className="error small">{uploadError}</p>}
        </section>

        <span className="reading-or" aria-hidden="true">
          or
        </span>

        <section className="card reading-custom">
          <h3 className="kicker">Paste Text</h3>
          <textarea
            className="reading-paste jp"
            value={pasted}
            onChange={(event) => setPasted(event.target.value)}
            placeholder="日本語をここに貼り付けてください"
            aria-label="Paste Japanese text to read"
          />
          <div className="reading-custom-actions">
            <span className="muted small">Used for this session only, never saved.</span>
            <button
              type="button"
              className="btn is-primary"
              onClick={openPasted}
              disabled={!pasted.trim()}
            >
              Read This
            </button>
          </div>
        </section>
      </div>
    </Page>
  )
}
