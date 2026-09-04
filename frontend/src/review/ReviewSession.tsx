import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '../components/Page'
import './ReviewSession.css'

type DueWord = {
  id: number
  term: string
  reading: string | null
  meaning: string
  sentence: string | null
  source: string | null
  isNew: boolean
}

type Rating = 'AGAIN' | 'HARD' | 'GOOD' | 'EASY'

const RATINGS: { rating: Rating; label: string; hint: string }[] = [
  { rating: 'AGAIN', label: 'Again', hint: 'No idea' },
  { rating: 'HARD', label: 'Hard', hint: 'Got there slowly' },
  { rating: 'GOOD', label: 'Good', hint: 'Knew it' },
  { rating: 'EASY', label: 'Easy', hint: 'Instantly' },
]

export function ReviewSession() {
  const [queue, setQueue] = useState<DueWord[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  const load = useCallback(() => {
    setError(false)
    fetch('/api/review/due?limit=20')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<DueWord[]>
      })
      .then((words) => {
        setQueue(words)
        setIndex(0)
        setRevealed(false)
      })
      .catch(() => setError(true))
  }, [])

  useEffect(load, [load])

  const word = queue?.[index]

  async function rate(rating: Rating) {
    if (!word) return
    setBusy(true)
    try {
      const response = await fetch(`/api/review/${word.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rating }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setDone((n) => n + 1)
      setRevealed(false)
      setIndex((i) => i + 1)
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  // Space reveals, then 1–4 rate. Reviewing is repetitive enough that reaching
  // for the mouse every card becomes the slowest part of it.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (!word || busy) return
      if (!revealed && (event.code === 'Space' || event.code === 'Enter')) {
        event.preventDefault()
        setRevealed(true)
        return
      }
      if (revealed) {
        const choice = RATINGS[Number(event.key) - 1]
        if (choice) {
          event.preventDefault()
          void rate(choice.rating)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (error) {
    return (
      <Page title="Review">
        <p className="error">Couldn&rsquo;t reach the server.</p>
      </Page>
    )
  }

  if (!queue) {
    return (
      <Page title="Review">
        <p className="muted">Loading…</p>
      </Page>
    )
  }

  if (queue.length === 0 || index >= queue.length) {
    return (
      <Page title="Review" subtitle="Words you have saved, when they are due.">
        <section className="card">
          <h3 className="kicker">{done > 0 ? 'Session Finished' : 'Nothing Due'}</h3>
          <p className="muted">
            {done > 0
              ? `You reviewed ${done} ${done === 1 ? 'word' : 'words'}.`
              : 'Nothing is due right now.'}{' '}
            Save more from <Link to="/mine">Mine</Link>, or see your{' '}
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
    <Page title="Review" subtitle="What does it mean?">
      <div className="session-progress muted small">
        {index + 1} of {queue.length}
        {word!.isNew && <span className="tag-new">new</span>}
      </div>

      <section className="card review-card">
        <span className="review-term jp-lg">{word!.term}</span>

        {revealed ? (
          <>
            {word!.reading && <span className="review-reading jp-sm">{word!.reading}</span>}
            <p className="review-meaning">{word!.meaning}</p>
            {word!.sentence && (
              <p className="review-sentence jp">
                {word!.sentence}
                {word!.source && <span className="review-source">{word!.source}</span>}
              </p>
            )}
          </>
        ) : (
          <p className="muted small">
            Recall the meaning, then reveal. <kbd>Space</kbd>
          </p>
        )}
      </section>

      {!revealed ? (
        <div>
          <button type="button" className="btn is-primary" onClick={() => setRevealed(true)}>
            Show the Meaning
          </button>
        </div>
      ) : (
        <div className="ratings">
          {RATINGS.map(({ rating, label, hint }, i) => (
            <button
              key={rating}
              type="button"
              className={`btn rating rating-${rating.toLowerCase()}`}
              onClick={() => rate(rating)}
              disabled={busy}
            >
              <span className="rating-label">
                {label} <kbd>{i + 1}</kbd>
              </span>
              <span className="rating-hint">{hint}</span>
            </button>
          ))}
        </div>
      )}
    </Page>
  )
}
