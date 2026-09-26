import { useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Page } from '../components/Page'
import './ReadingPage.css'

const ACCEPT = '.txt,.pdf,.epub'

/** A short passage to try the page with, before you have one of your own. */
const SAMPLE =
  'その古い家の窓から、山吹色の光が漏れていた。彼は毎朝六時に起きて、川沿いを走ることにしている。'

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
      {/* A bento like every other page: the paste box leads, the file drop and a
          ready-made passage share the column beside it. It used to be two equal
          boxes and a tiny "or", capped at 34rem so the bottom of a 1080p screen
          stayed empty. */}
      <div className="reading-start">
        <section className="reading-tile reading-custom">
          <h3 className="tile-title">What Do You Want to Read Aloud?</h3>
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

        {/* A real drop target rather than the browser's own "Choose File"
            control, which rendered as an unstyled grey button. The hidden input
            still does the picking, so keyboard and screen-reader use are
            unchanged. */}
        <section
          className={`reading-tile reading-drop${dragging ? ' is-dragging' : ''}${uploading ? ' is-busy' : ''}`}
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
          <span className="reading-ghost" aria-hidden="true">
            読
          </span>
          <h3 className="tile-title">{uploading ? 'Reading Your File…' : 'Or Drop a File'}</h3>
          <p className="reading-drop-formats">A .txt, .pdf or .epub — a chapter, an article, anything.</p>
          <button
            type="button"
            className="btn reading-drop-button"
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

        <section className="reading-tile reading-sample is-inverted">
          <h3 className="tile-title">Try One</h3>
          <p className="reading-sample-text jp" lang="ja">
            {SAMPLE}
          </p>
          <button
            type="button"
            className="btn is-primary reading-sample-go"
            onClick={() =>
              navigate('/read/session', { state: { text: SAMPLE, source: 'Sample passage' } })
            }
          >
            Read It Aloud
          </button>
        </section>
      </div>
    </Page>
  )
}
