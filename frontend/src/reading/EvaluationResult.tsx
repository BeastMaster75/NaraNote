export type MisreadSpan = {
  /** Offsets into the text that was sent, so the word can be underlined in place. */
  start: number
  end: number
  expected: string
  /** Hiragana as it should sound — what /api/tts is given. */
  say: string
  heard: string
  type: 'misread' | 'skipped'
}

export type EvaluateResponse = {
  /** What was heard, in hiragana. */
  transcript: string
  matched: boolean
  wordCount: number
  misreads: MisreadSpan[]
  feedback: string
}

/**
 * Always the specifics — the words that didn't match, what was heard instead,
 * and how each should sound — never a bare score. The same words are underlined
 * in the passage; this is the list form of them.
 */
export function EvaluationResult({
  result,
  onNext,
  onRetry,
  onSay,
  isLast,
}: {
  result: EvaluateResponse
  onNext: () => void
  onRetry: () => void
  onSay: (text: string) => void
  isLast: boolean
}) {
  return (
    <div className="reading-result">
      <span className={`reading-verdict${result.matched ? ' is-match' : ' is-mismatch'}`}>
        {result.matched ? 'Matched' : 'Not Quite'}
      </span>

      <p className="reading-feedback">{result.feedback}</p>

      {result.misreads.length > 0 && (
        <ul className="reading-misreads">
          {result.misreads.map((misread) => (
            <li key={misread.start} className="reading-misread">
              <button
                type="button"
                className="reading-say"
                onClick={() => onSay(misread.say)}
                aria-label={`Hear ${misread.expected} said correctly`}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M11 5 6 9H2v6h4l5 4z M15.5 8.5a5 5 0 0 1 0 7" />
                </svg>
              </button>
              <span className="reading-misread-word jp">{misread.expected}</span>
              <span className="reading-misread-says jp">{misread.say}</span>
              <span className="reading-misread-heard small">
                {misread.type === 'skipped' ? (
                  <span className="muted">skipped</span>
                ) : (
                  <>
                    <span className="muted">heard </span>
                    <span className="jp">{misread.heard}</span>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {result.transcript && (
        <details className="reading-heard">
          <summary className="muted small">Everything Heard</summary>
          <p className="reading-transcript jp">{result.transcript}</p>
        </details>
      )}

      <div className="reading-result-actions">
        <button type="button" className="btn" onClick={onRetry}>
          Try Again
        </button>
        <button type="button" className="btn is-primary" onClick={onNext}>
          {isLast ? 'Finish' : 'Next Chunk'}
        </button>
      </div>
    </div>
  )
}
