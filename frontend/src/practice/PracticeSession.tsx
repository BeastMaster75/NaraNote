import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '../components/Page'
import { WritingCanvas, type Stroke } from './WritingCanvas'
import './PracticeSession.css'

type DueCard = {
  literal: string
  strokeCount: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
  strokeOrderSvg: string | null
  isNew: boolean
}

type Rating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY'

const RATINGS: { rating: Rating; label: string; hint: string }[] = [
  { rating: 'AGAIN', label: 'Again', hint: 'Could not write it' },
  { rating: 'HARD', label: 'Hard', hint: 'Got there, badly' },
  { rating: 'GOOD', label: 'Good', hint: 'Right, with effort' },
  { rating: 'EASY', label: 'Easy', hint: 'Straight off' },
]

const CANVAS_SIZE = 340

export function PracticeSession() {
  const [queue, setQueue] = useState<DueCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(0)

  const load = useCallback(() => {
    setError(false)
    fetch('/api/practice/due?limit=20')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<DueCard[]>
      })
      .then((cards) => {
        setQueue(cards)
        setIndex(0)
        setStrokes([])
        setRevealed(false)
      })
      .catch(() => setError(true))
  }, [])

  useEffect(load, [load])

  const card = queue?.[index]

  async function rate(rating: Rating) {
    if (!card) return
    setSaving(true)
    try {
      const response = await fetch(
        `/api/practice/${encodeURIComponent(card.literal)}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rating, strokesDrawn: strokes.length }),
        },
      )
      if (!response.ok) throw new Error(String(response.status))
      setDone((n) => n + 1)
      setStrokes([])
      setRevealed(false)
      setIndex((i) => i + 1)
    } catch {
      setError(true)
    } finally {
      setSaving(false)
    }
  }

  if (error) {
    return (
      <Page title="Write">
        <p className="error">Couldn&rsquo;t reach the server.</p>
      </Page>
    )
  }

  if (!queue) {
    return (
      <Page title="Write">
        <p className="muted">Loading…</p>
      </Page>
    )
  }

  if (queue.length === 0 || index >= queue.length) {
    return (
      <Page title="Write" subtitle="Handwriting practice.">
        <section className="card">
          <h3 className="kicker">{done > 0 ? 'Session Finished' : 'Nothing Due'}</h3>
          <p className="muted">
            {done > 0
              ? `You practised ${done} ${done === 1 ? 'character' : 'characters'}.`
              : 'Nothing is due right now.'}{' '}
            Add more from the <Link to="/kanji">kanji page</Link>, or see your{' '}
            <Link to="/collection">collection</Link>.
          </p>
          <div>
            <button type="button" className="btn" onClick={load}>
              Check Again
            </button>
          </div>
        </section>
      </Page>
    )
  }

  return (
    <Page title="Write" subtitle="Read the clue, write the character, then check yourself.">
      <div className="session-progress muted small">
        {index + 1} of {queue.length}
        {card?.isNew && <span className="tag-new">new</span>}
      </div>

      <div className="session">
        <section className="card prompt">
          <h3 className="kicker">Write the Kanji For</h3>
          <p className="prompt-meaning">{card!.meanings.slice(0, 4).join(', ')}</p>
          <dl className="prompt-readings">
            <div>
              <dt>On</dt>
              <dd className="jp-sm">{card!.onReadings.join('・') || '—'}</dd>
            </div>
            <div>
              <dt>Kun</dt>
              <dd className="jp-sm">{card!.kunReadings.join('・') || '—'}</dd>
            </div>
            <div>
              <dt>Strokes</dt>
              <dd>{card!.strokeCount ?? '—'}</dd>
            </div>
          </dl>
        </section>

        <div className="session-work">
          <div className="canvas-wrap" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}>
            <WritingCanvas
              strokes={strokes}
              onChange={setStrokes}
              size={CANVAS_SIZE}
              disabled={revealed}
              showNumbers={revealed}
            />
          </div>
          <div className="canvas-actions">
            <span className="muted small">
              {strokes.length} {strokes.length === 1 ? 'stroke' : 'strokes'} drawn
            </span>
            <button
              type="button"
              className="btn"
              onClick={() => setStrokes(strokes.slice(0, -1))}
              disabled={revealed || strokes.length === 0}
            >
              Undo Stroke
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => setStrokes([])}
              disabled={revealed || strokes.length === 0}
            >
              Clear
            </button>
          </div>
        </div>

        {revealed && (
          <section className="card answer">
            <h3 className="kicker">The Answer</h3>
            <div className="answer-body">
              <span className="answer-glyph">{card!.literal}</span>
              {card!.strokeOrderSvg ? (
                <div
                  className="stroke-order"
                  // Our own imported KanjiVG, not user content.
                  dangerouslySetInnerHTML={{ __html: card!.strokeOrderSvg }}
                />
              ) : (
                <p className="muted small">No stroke diagram for this character.</p>
              )}
            </div>
            <p className="muted small">
              You drew {strokes.length}; it has {card!.strokeCount ?? '—'}. Your strokes are
              numbered in the order you made them — compare them one by one against the diagram.
            </p>
          </section>
        )}
      </div>

      {!revealed ? (
        <div>
          <button
            type="button"
            className="btn is-primary"
            onClick={() => setRevealed(true)}
          >
            Show the Answer
          </button>
        </div>
      ) : (
        <div className="ratings">
          {RATINGS.map(({ rating, label, hint }) => (
            <button
              key={rating}
              type="button"
              className={`btn rating rating-${rating.toLowerCase()}`}
              onClick={() => rate(rating)}
              disabled={saving}
            >
              <span className="rating-label">{label}</span>
              <span className="rating-hint">{hint}</span>
            </button>
          ))}
        </div>
      )}
    </Page>
  )
}
