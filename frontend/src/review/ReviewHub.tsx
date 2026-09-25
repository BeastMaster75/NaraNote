import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { KanjiFilterBar } from '../components/KanjiFilterBar'
import { Page } from '../components/Page'
import { useFitRows, useFitTiles } from '../components/useFitTiles'
import { downloadFile } from '../lib/download'
import './ReviewHub.css'

export type Deck = {
  /** Opaque — pass it back, don't rebuild it. See DeckRef on the server. */
  id: string
  name: string
  kind: 'WORDS' | 'KANJI'
  total: number
  due: number
  unseen: number
}

/**
 * The Reading deck: words made entirely of kanji you already hold, generated on
 * the server (RecognitionWordService) as the collection grows. Its id is the
 * deck id format from DeckRef — `words:` plus the source it is stored under.
 */
const WORDS_DECK_ID = 'words:Reading'

/** Enough to fill either preview at any size; each clips to whole rows. */
const PREVIEW_KANJI = 40
/**
 * The words preview doubles as the count when a JLPT level is picked — the
 * deck's own due count doesn't know about the filter — so it fetches up to the
 * session maximum, and shows "100+" past it.
 */
const PREVIEW_WORDS = 100

type DueKanji = { literal: string }
type DueWord = { id: number; term: string; reading: string | null; meaning: string }

/** Due kanji fill their preview: big when few, down to list size when many. */
const KANJI_TILES = { min: 50, max: 112, gap: 8 } // gap mirrors .track-kanji

/** Height of one word row, in px. Mirrors .track-words (2.4rem). */
const WORD_ROW = 38.4

const PENCIL = 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z'
const CARDS = 'M8 6h12v11H8z M4 4h11v2H6v11H4z'

function TrackIcon({ d }: { d: string }) {
  return (
    <span className="track-icon" aria-hidden="true">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </span>
  )
}

/**
 * Review is two things, side by side: writing your kanji by hand, and reading
 * the words built from them. Each gets one card with what's ready now, a look
 * at what that is, and one button to start.
 *
 * <p>It used to be a list of word decks — one per source typed while mining —
 * with handwriting as a row among them. Words stopped being something you save
 * (the collection is kanji), so those source decks no longer describe anything
 * you do. Their words are still in the database and still reachable at
 * /review/deck?id=…; they just aren't a destination here.
 *
 * <p>The two queues stay separate on purpose: different schedulers, different
 * activities, and handwriting is the one thing Anki can't do.
 */
export function ReviewHub() {
  const navigate = useNavigate()
  const [decks, setDecks] = useState<Deck[] | null>(null)
  const [error, setError] = useState(false)
  const [dueKanji, setDueKanji] = useState<DueKanji[]>([])
  const [dueWords, setDueWords] = useState<DueWord[] | null>(null)
  const [jlptLevel, setJlptLevel] = useState<number | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [kanjiRef, { size: tile }] = useFitTiles(dueKanji.length, KANJI_TILES)
  const [wordsRef, wordRows] = useFitRows(dueWords?.length ?? 0, WORD_ROW)

  const load = useCallback(() => {
    setError(false)
    fetch('/api/decks')
      .then((response) => {
        if (!response.ok) throw new Error(String(response.status))
        return response.json() as Promise<Deck[]>
      })
      .then(setDecks)
      .catch(() => setError(true))
    // Both "due" endpoints are read-only, so previewing them schedules nothing.
    fetch(`/api/practice/due?limit=${PREVIEW_KANJI}`)
      .then((response) => (response.ok ? (response.json() as Promise<DueKanji[]>) : []))
      .then(setDueKanji)
      .catch(() => setDueKanji([]))
  }, [])

  useEffect(load, [load])

  useEffect(() => {
    const params = new URLSearchParams({ deck: WORDS_DECK_ID, limit: String(PREVIEW_WORDS) })
    if (jlptLevel !== null) params.set('jlptLevel', String(jlptLevel))
    let cancelled = false
    fetch(`/api/review/due?${params}`)
      .then((response) => (response.ok ? (response.json() as Promise<DueWord[]>) : []))
      .then((words) => !cancelled && setDueWords(words))
      .catch(() => !cancelled && setDueWords([]))
    return () => {
      cancelled = true
    }
  }, [jlptLevel])

  async function exportWords() {
    setExporting(true)
    setExportError(null)
    try {
      await downloadFile(
        `/api/export/anki?deck=${encodeURIComponent(WORDS_DECK_ID)}`,
        'naranote.apkg',
      )
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  if (error) {
    return (
      <Page title="Review">
        <p className="error">Couldn&rsquo;t reach the server.</p>
      </Page>
    )
  }

  if (!decks) {
    return (
      <Page title="Review">
        <p className="muted">Loading&hellip;</p>
      </Page>
    )
  }

  const kanjiDeck = decks.find((deck) => deck.kind === 'KANJI')
  const wordsDeck = decks.find((deck) => deck.id === WORDS_DECK_ID)

  // Unfiltered, the deck's own count is exact. Filtered by level, only the
  // fetched list knows — capped at the session maximum.
  const wordsDue =
    jlptLevel === null ? (wordsDeck?.due ?? 0) : Math.min(dueWords?.length ?? 0, PREVIEW_WORDS)
  const wordsDueLabel =
    jlptLevel !== null && (dueWords?.length ?? 0) >= PREVIEW_WORDS ? `${PREVIEW_WORDS}+` : wordsDue

  function wordsSessionUrl() {
    const params = new URLSearchParams({ deck: WORDS_DECK_ID })
    if (jlptLevel !== null) params.set('jlptLevel', String(jlptLevel))
    return `/review/session?${params}`
  }

  return (
    <Page title="Review" subtitle="Your kanji, by hand and in words.">
      <div className="tracks">
        <section className="card track">
          <header className="track-head">
            <TrackIcon d={PENCIL} />
            <div>
              <h3 className="track-title">Writing</h3>
              <p className="muted small">Draw each kanji from memory.</p>
            </div>
          </header>

          {kanjiDeck && kanjiDeck.total > 0 ? (
            <>
              <div className="track-stat">
                <span className="track-count">{kanjiDeck.due}</span>
                <span className="track-count-label">
                  ready now
                  <span className="track-count-detail">
                    {kanjiDeck.unseen > 0 && `${kanjiDeck.unseen} new · `}
                    {kanjiDeck.total} kanji in all
                  </span>
                </span>
              </div>

              <ul
                className="track-kanji"
                aria-label="Kanji ready to write"
                ref={kanjiRef}
                style={{ '--tile': `${tile}px` } as CSSProperties}
              >
                {dueKanji.map((card) => (
                  <li key={card.literal}>{card.literal}</li>
                ))}
                {dueKanji.length === 0 && (
                  <li className="track-empty muted small">
                    Nothing to write right now. Come back when something is due.
                  </li>
                )}
              </ul>

              <footer className="track-actions">
                <button
                  type="button"
                  className="btn is-primary track-go"
                  disabled={kanjiDeck.due === 0}
                  onClick={() => navigate('/write')}
                >
                  Start Writing
                </button>
                <Link to="/collection" className="btn">
                  Your Kanji
                </Link>
              </footer>
            </>
          ) : (
            <div className="track-blank">
              <p className="muted">
                Add a kanji to your collection and it will be waiting here to write.
              </p>
              <Link to="/kanji" className="btn is-primary">
                Find a Kanji
              </Link>
            </div>
          )}
        </section>

        <section className="card track">
          <header className="track-head">
            <TrackIcon d={CARDS} />
            <div>
              <h3 className="track-title">Words</h3>
              <p className="muted small">Read words built from your kanji.</p>
            </div>
          </header>

          {wordsDeck && wordsDeck.total > 0 ? (
            <>
              <div className="track-stat">
                <span className="track-count">{wordsDueLabel}</span>
                <span className="track-count-label">
                  ready now
                  <span className="track-count-detail">
                    {jlptLevel === null
                      ? `${wordsDeck.unseen > 0 ? `${wordsDeck.unseen} new · ` : ''}${wordsDeck.total} words in all`
                      : `at N${jlptLevel}`}
                  </span>
                </span>
              </div>

              <KanjiFilterBar jlptLevel={jlptLevel} onJlptLevelChange={setJlptLevel} />

              <ul
                className="track-words"
                aria-label="Words ready to review"
                ref={wordsRef}
                style={{ '--rows': wordRows } as CSSProperties}
              >
                {(dueWords ?? []).map((word) => (
                  <li key={word.id} className="track-word">
                    <span className="track-word-term">{word.term}</span>
                    {word.reading && word.reading !== word.term && (
                      <span className="track-word-reading">{word.reading}</span>
                    )}
                    <span className="track-word-meaning">{word.meaning}</span>
                  </li>
                ))}
                {dueWords !== null && dueWords.length === 0 && (
                  <li className="track-empty muted small">
                    {jlptLevel === null
                      ? 'Nothing to review right now.'
                      : `Nothing due at N${jlptLevel}.`}
                  </li>
                )}
              </ul>

              {exportError && <p className="error small">{exportError}</p>}

              <footer className="track-actions">
                <button
                  type="button"
                  className="btn is-primary track-go"
                  disabled={wordsDue === 0}
                  onClick={() => navigate(wordsSessionUrl())}
                >
                  Start Review
                </button>
                <Link to={`/review/deck?id=${encodeURIComponent(WORDS_DECK_ID)}`} className="btn">
                  Browse
                </Link>
                <button
                  type="button"
                  className="btn track-export"
                  disabled={exporting}
                  onClick={exportWords}
                  title="Download these words as an Anki deck"
                >
                  {exporting ? 'Building…' : 'Export to Anki'}
                </button>
              </footer>
            </>
          ) : (
            <div className="track-blank">
              <p className="muted">
                Words appear here as your collection grows — common words made only of
                kanji you already have.
              </p>
            </div>
          )}
        </section>
      </div>
    </Page>
  )
}
