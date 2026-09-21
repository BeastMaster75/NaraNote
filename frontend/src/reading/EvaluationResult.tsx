export type MisreadSpan = { expected: string; heard: string; type: string }

export type EvaluateResponse = {
  transcript: string
  matched: boolean
  misreads: MisreadSpan[]
  feedback: string
}

/**
 * Always the specifics — an actual transcript and named mismatches — never a
 * bare score. That's the whole point of sending this to Gemini with a forced
 * response schema instead of trusting free-form prose.
 */
export function EvaluationResult({
  result,
  onNext,
  isLast,
}: {
  result: EvaluateResponse
  onNext: () => void
  isLast: boolean
}) {
  return (
    <div className="reading-result">
      <span className={`reading-verdict${result.matched ? ' is-match' : ' is-mismatch'}`}>
        {result.matched ? 'Matched' : 'Not Quite'}
      </span>

      <p className="reading-transcript jp">{result.transcript || '—'}</p>

      {result.misreads.length > 0 && (
        <ul className="reading-misreads">
          {result.misreads.map((misread, index) => (
            <li key={index}>
              <span className="jp">{misread.expected}</span>
              <span className="muted small"> expected</span>
              {' — '}
              <span className="jp">{misread.heard || '(skipped)'}</span>
              <span className="muted small"> heard · {misread.type}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="muted small reading-feedback">{result.feedback}</p>

      <button type="button" className="btn is-primary" onClick={onNext}>
        {isLast ? 'Finish' : 'Next Chunk'}
      </button>
    </div>
  )
}
