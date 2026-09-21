import { useState } from 'react'
import { Toast } from './Toast'

/**
 * Kanji met over the whole passage, each an independent one-click add — not a
 * bulk "add all" action. One click, no confirmation, so it's backed by an undo
 * toast rather than an are-you-sure: fast to use, still reversible.
 */
export function ReadingSummary({
  kanji,
  library,
  onDone,
}: {
  kanji: string[]
  library: Set<string>
  onDone: () => void
}) {
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  async function add(literal: string) {
    setBusy(literal)
    try {
      const response = await fetch('/api/library/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ literals: [literal], source: 'READING' }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setAdded((prev) => new Set(prev).add(literal))
      setToast(literal)
    } catch {
      // Left un-added — the chip just stays clickable to retry.
    } finally {
      setBusy(null)
    }
  }

  async function undo(literal: string) {
    await fetch(`/api/library/${encodeURIComponent(literal)}`, { method: 'DELETE' })
    setAdded((prev) => {
      const next = new Set(prev)
      next.delete(literal)
      return next
    })
  }

  return (
    <div className="reading-summary">
      <h3 className="kicker">Kanji You Met</h3>

      {kanji.length === 0 ? (
        <p className="muted small">No kanji in this passage.</p>
      ) : (
        <ul className="reading-kanji-grid">
          {kanji.map((literal) => {
            const already = library.has(literal) || added.has(literal)
            return (
              <li key={literal}>
                <button
                  type="button"
                  className={`reading-kanji-chip${already ? ' is-added' : ''}`}
                  onClick={() => add(literal)}
                  disabled={already || busy === literal}
                  title={already ? 'Already in your library' : `Add ${literal} to your library`}
                >
                  {literal}
                </button>
              </li>
            )
          })}
        </ul>
      )}

      <button type="button" className="btn is-primary" onClick={onDone}>
        Done
      </button>

      {toast && (
        <Toast
          message={`Added ${toast} to your library`}
          actionLabel="Undo"
          onAction={() => undo(toast)}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  )
}
