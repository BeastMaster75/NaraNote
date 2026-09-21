import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Marked } from './Marked'
import './KanjiPickDetail.css'

/**
 * The kanji-first half of mining: one character out of a passage, and the
 * sentence it was met in, filed together. Adding it to the collection is part
 * of the same action rather than a second errand — the character is only
 * worth collecting because of where you found it.
 *
 * Extracted out of Mining so Read can offer the exact same tap-to-inspect-and-
 * file flow rather than a second, differently-behaved kanji detail panel.
 */
export function KanjiPickDetail({
  literal,
  sentence,
  source,
  alreadyYours,
  onFiled,
  onClose,
}: {
  literal: string
  sentence: string
  source: string
  alreadyYours: boolean
  onFiled: () => void
  onClose: () => void
}) {
  const [kanji, setKanji] = useState<{
    meanings: string[]
    onReadings: string[]
    kunReadings: string[]
    strokeCount: number | null
  } | null>(null)
  const [filed, setFiled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/kanji/${encodeURIComponent(literal)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then(setKanji)
      .catch(() => setKanji(null))
  }, [literal])

  async function file() {
    setBusy(true)
    setError(null)
    try {
      const response = await fetch(`/api/kanji/${encodeURIComponent(literal)}/sentences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence, source: source.trim() || null }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setFiled(true)
      // So the passage behind this panel dims the character straight away.
      onFiled()
    } catch {
      setError('Couldn’t file that sentence.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="word-detail card">
      <header className="word-head">
        <div>
          <span className="word-term jp-lg">{literal}</span>
        </div>
        <button type="button" className="word-close" onClick={onClose}>
          ← Translation
        </button>
      </header>

      {kanji === null ? (
        <p className="muted small">Looking it up…</p>
      ) : (
        <>
          <p className="pick-meaning">{kanji.meanings.slice(0, 4).join(', ') || '—'}</p>
          <p className="muted small">
            {kanji.onReadings.join('・') || '—'} / {kanji.kunReadings.join('・') || '—'} ·{' '}
            {kanji.strokeCount ?? '—'} strokes
            {alreadyYours && ' · already in your collection'}
          </p>
        </>
      )}

      <div className="word-context">
        <span className="kicker">Sentence to File</span>
        <p className="jp">
          <Marked text={sentence} needle={literal} />
        </p>
      </div>

      {error && <p className="error small">{error}</p>}

      <div className="word-actions">
        {filed ? (
          <>
            <span className="pick-done small">Filed under {literal}</span>
            <Link to={`/collection/${encodeURIComponent(literal)}`} className="btn">
              See {literal}
            </Link>
          </>
        ) : (
          <button
            type="button"
            className="btn is-primary"
            onClick={file}
            disabled={busy || kanji === null}
          >
            {busy
              ? 'Filing…'
              : alreadyYours
                ? `File This Sentence Under ${literal}`
                : `Add ${literal} With This Sentence`}
          </button>
        )}
      </div>
    </section>
  )
}
