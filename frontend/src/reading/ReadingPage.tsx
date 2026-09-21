import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Page } from '../components/Page'
import './ReadingPage.css'

/**
 * Where a Read session starts: your own text, either a file upload or a
 * straight paste. Hands off to {@code ReadingSession}, which does the actual
 * analysing.
 */
export function ReadingPage() {
  const navigate = useNavigate()
  const [pasted, setPasted] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

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
        <button type="button" className="btn is-primary" onClick={openPasted} disabled={!pasted.trim()}>
          Read This
        </button>
      </section>
    </Page>
  )
}
