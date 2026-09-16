import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Page } from '../components/Page'
import { useUser } from '../user/UserContext'
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

/**
 * /api/tts responses are cached by the browser for a year (see TtsController) — the URL is
 * the cache key, and it never otherwise changes, so a word played before a server-side voice
 * change stays stuck on the old voice forever unless the URL changes too. Bump this to match
 * naranote.voicevox.speaker-id (application.yaml) whenever the default voice changes; the
 * backend doesn't read this param at all, it exists purely to bust stale client caches.
 */
const VOICEVOX_SPEAKER_ID = 2

export function ReviewSession() {
  const { me, loaded } = useUser()
  const searchParams = useSearchParams()[0]
  // Absent means every deck, which is the default the hub sends you here with.
  const deck = searchParams.get('deck')
  // Absent means every level — an exact match when set, not a cap.
  const jlptLevel = searchParams.get('jlptLevel')
  const [queue, setQueue] = useState<DueWord[] | null>(null)
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [done, setDone] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  // Held until /api/me answers, so the first queue is the length the user asked
  // for rather than a default that gets replaced a moment later.
  const load = useCallback(() => {
    if (!loaded) return
    setError(false)
    const scope = deck ? `&deck=${encodeURIComponent(deck)}` : ''
    const level = jlptLevel ? `&jlptLevel=${encodeURIComponent(jlptLevel)}` : ''
    fetch(`/api/review/due?limit=${me.sessionSize}${scope}${level}`)
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
  }, [loaded, me.sessionSize, deck, jlptLevel])

  useEffect(load, [load])

  const word = queue?.[index]

  // Auto-plays once per reveal. Server-generated and cached (see /api/tts) rather than the
  // browser's speechSynthesis — that only makes sound if the visitor's OS happens to have a
  // Japanese voice installed, which most don't.
  useEffect(() => {
    if (!revealed || !word) return
    const audio = new Audio(
      `/api/tts?text=${encodeURIComponent(word.reading || word.term)}&voice=${VOICEVOX_SPEAKER_ID}`,
    )
    audio.play().catch(() => {})
    return () => audio.pause()
  }, [revealed, word])

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
        <div className="focus">
          <p className="error">Couldn&rsquo;t reach the server.</p>
        </div>
      </Page>
    )
  }

  if (!queue) {
    return (
      <Page title="Review">
        <div className="focus">
          <p className="muted">Loading…</p>
        </div>
      </Page>
    )
  }

  if (queue.length === 0 || index >= queue.length) {
    return (
      <Page title="Review" subtitle="Words you have saved, when they are due.">
        <div className="focus">
          <section className="card">
            <h3 className="kicker">{done > 0 ? 'Session Finished' : 'Nothing Due'}</h3>
            <p className="muted">
              {done > 0
                ? `You reviewed ${done} ${done === 1 ? 'word' : 'words'}.`
                : 'Nothing is due right now.'}{' '}
              Save more from <Link to="/mine">Mine</Link>, or pick another deck.
            </p>
            <div className="session-done-actions">
              <Link to="/review" className="btn is-primary">
                All Decks
              </Link>
              <button type="button" className="btn" onClick={load}>
                Check Again
              </button>
            </div>
          </section>
        </div>
      </Page>
    )
  }

  return (
    <Page title="Review" subtitle="What does it mean?">
      <div className="focus">
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
      </div>
    </Page>
  )
}
