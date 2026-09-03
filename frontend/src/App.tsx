import { useEffect, useState } from 'react'
import './App.css'

type PingResponse = {
  message: string
  createdAt: string
}

function toggleTheme() {
  const root = document.documentElement
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  root.setAttribute('data-theme', next)
}

function App() {
  const [ping, setPing] = useState<PingResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/ping')
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`)
        }
        return response.json() as Promise<PingResponse>
      })
      .then(setPing)
      .catch((cause: unknown) => setError(String(cause)))
  }, [])

  return (
    <main className="shell">
      <header className="head">
        <span className="mark">奈</span>
        <div className="head-text">
          <h1>Naranote</h1>
          <p className="muted">Japanese study companion</p>
        </div>
        <button type="button" className="btn" onClick={toggleTheme}>
          Theme
        </button>
      </header>

      <section className="card">
        <h2 className="kicker">Backend</h2>
        {error && <p className="error">Backend unreachable — {error}</p>}
        {!error && !ping && <p className="muted">Loading…</p>}
        {ping && (
          <>
            <p className="plain">{ping.message}</p>
            <p className="muted small">
              row created {new Date(ping.createdAt).toLocaleString()}
            </p>
          </>
        )}
      </section>

      <section className="card">
        <h2 className="kicker">Type specimen</h2>
        <p className="jp jp-ruby">
          その古い家の<ruby>窓<rt>まど</rt></ruby>から、
          <ruby>山吹色<rt>やまぶきいろ</rt></ruby>の光が
          <span className="jp-known">漏れて</span>いた。
        </p>
        <p className="muted small">
          Japanese at <code>--nn-jp-body</code> with furigana. The dimmed word uses{' '}
          <code>--nn-jp-known</code> — the one sanctioned soft Japanese, meaning
          &ldquo;already saved&rdquo;. Everything else sits at full contrast.
        </p>
      </section>
    </main>
  )
}

export default App
