import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import './BatchAddModal.css'

type BatchResult = {
  added: number
  alreadySaved: number
  notFound: number
  notFoundLiterals: string[]
}

/**
 * CJK Unified Ideographs (4E00–9FFF) and Extension A (3400–4DBF).
 * This is everything KANJIDIC2 covers. Kana, punctuation, Latin and
 * everything else is silently ignored.
 */
const CJK_RE = /[\u4E00-\u9FFF\u3400-\u4DBF]/g

function extractKanji(text: string): string[] {
  const matches = text.match(CJK_RE)
  if (!matches) return []
  // Deduplicate, preserving first-seen order.
  return [...new Set(matches)]
}

type BatchAddModalProps = {
  /** Literals already in the library — shown dimmed in the preview. */
  savedLiterals: Set<string>
  /** Called after a successful add so the parent can reload. */
  onDone: () => void
  /** Style variant for the trigger button. Defaults to 'default'. */
  variant?: 'default' | 'primary'
}

export function BatchAddModal({ savedLiterals, onDone, variant = 'default' }: BatchAddModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BatchResult | null>(null)
  const [error, setError] = useState(false)

  const extracted = extractKanji(input)
  const newCount = extracted.filter((k) => !savedLiterals.has(k)).length

  function open() {
    setInput('')
    setResult(null)
    setError(false)
    dialogRef.current?.showModal()
  }

  function close() {
    dialogRef.current?.close()
  }

  function handleDialogClose() {
    if (result && result.added > 0) {
      onDone()
    }
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    const dialog = dialogRef.current
    if (!dialog) return
    const rect = dialog.getBoundingClientRect()
    const isInDialog =
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    if (!isInDialog) {
      close()
    }
  }

  function addMore() {
    if (result && result.added > 0) {
      onDone()
    }
    setInput('')
    setResult(null)
    setError(false)
  }

  async function submit() {
    if (extracted.length === 0) return
    setBusy(true)
    setError(false)
    try {
      const response = await fetch('/api/library/batch', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ literals: extracted }),
      })
      if (!response.ok) throw new Error(String(response.status))
      const data: BatchResult = await response.json()
      setResult(data)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <button
        type="button"
        className={`btn${variant === 'primary' ? ' is-primary' : ''}`}
        onClick={open}
      >
        + Batch Add
      </button>

      {createPortal(
        <dialog
          ref={dialogRef}
          className="batch-modal"
          onClose={handleDialogClose}
          onClick={handleBackdropClick}
        >
        <div className="batch-header">
          <h3>Batch Add Kanji</h3>
          <button type="button" className="batch-close" onClick={close} aria-label="Close">
            ×
          </button>
        </div>

        <div className="batch-body">
          <p className="muted small">
            Paste any text containing kanji — a word list, a sentence, or a study guide.
            Every unique character will be extracted and added to your library.
          </p>

          {!result ? (
            <>
              <textarea
                className="batch-input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value)
                  setResult(null)
                }}
                placeholder="漢字を入力してください… (e.g. 漢字、学習、猫 or paste a passage)"
                autoFocus
              />

              {extracted.length > 0 && (
                <div className="batch-preview">
                  <span className="batch-preview-label">
                    {extracted.length} {extracted.length === 1 ? 'character' : 'characters'} found
                    {newCount < extracted.length &&
                      ` · ${extracted.length - newCount} already saved`}
                  </span>
                  <ul className="batch-grid">
                    {extracted.map((k) => (
                      <li
                        key={k}
                        className={`batch-chip${savedLiterals.has(k) ? ' is-saved' : ''}`}
                        title={savedLiterals.has(k) ? 'Already in your library' : k}
                      >
                        {k}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {extracted.length === 0 && input.trim().length > 0 && (
                <p className="batch-empty">No kanji found in this text.</p>
              )}

              <div className="batch-footer">
                <button
                  type="button"
                  className="btn is-primary"
                  onClick={submit}
                  disabled={busy || newCount === 0}
                >
                  {busy
                    ? 'Adding…'
                    : newCount > 0
                      ? `Add ${newCount} ${newCount === 1 ? 'kanji' : 'kanji'}`
                      : extracted.length > 0
                        ? 'All already saved'
                        : 'Add kanji'}
                </button>
                {error && <span className="error small">Couldn&rsquo;t reach the server.</span>}
              </div>
            </>
          ) : (
            <>
              <div className="batch-result">
                {result.added > 0 && (
                  <p className="batch-result-line">
                    <strong>{result.added}</strong> {result.added === 1 ? 'character' : 'characters'}{' '}
                    added to your library.
                  </p>
                )}
                {result.alreadySaved > 0 && (
                  <p className="batch-result-line">
                    <strong>{result.alreadySaved}</strong> already in your library.
                  </p>
                )}
                {result.notFound > 0 && (
                  <p className="batch-result-line">
                    <strong>{result.notFound}</strong> not in the dictionary
                    {result.notFoundLiterals.length > 0 && (
                      <span className="jp-sm">
                        {' '}
                        (
                        {result.notFoundLiterals.slice(0, 10).join('、')}
                        {result.notFoundLiterals.length > 10
                          ? ` and ${result.notFoundLiterals.length - 10} more`
                          : ''}
                        )
                      </span>
                    )}
                    .
                  </p>
                )}
                {result.added === 0 && result.notFound === 0 && (
                  <p className="batch-result-line">Everything was already in your library.</p>
                )}
              </div>
              <div className="batch-footer">
                <button type="button" className="btn is-primary" onClick={close}>
                  Done
                </button>
                <button type="button" className="btn" onClick={addMore}>
                  Add More
                </button>
              </div>
            </>
          )}
        </div>
      </dialog>,
      document.body,
    )}
  </>
)
}
