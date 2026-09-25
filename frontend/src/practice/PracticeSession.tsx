import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Page } from '../components/Page'
import { useUser } from '../user/UserContext'
import { StrokeAnimation } from '../components/StrokeAnimation'
import { WritingCanvas, type Stroke } from './WritingCanvas'
import { parseKanjiVg } from './kanjiVg'
import { checkStrokes, type StrokeCheck, type Verdict } from './strokeCheck'
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

/**
 * What the marking suggests you press. Only ever a suggestion: it can't know
 * whether the character came straight to you (Easy) or after a long think, and
 * you may well disagree with a stroke it flagged.
 *
 * <p>Every stroke right is Good. A few recognisable slips — order, direction,
 * proportion — with nothing missing or unrecognised is Hard. Anything worse
 * is Again.
 */
function suggestRating(check: StrokeCheck): Rating {
  const slips = check.marks.filter((m) => m.verdict !== 'correct')
  if (slips.length === 0 && check.missing.length === 0) return 'GOOD'
  const allRecognised = check.missing.length === 0 && slips.every((m) => m.verdict !== 'off')
  if (allRecognised && slips.length <= Math.max(2, Math.floor(check.expected / 4))) return 'HARD'
  return 'AGAIN'
}

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
function ordinal(n: number) {
  const teen = n % 100 >= 11 && n % 100 <= 13
  const suffix = teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
  return `${n}${suffix}`
}

/**
 * One line per kind of slip, naming strokes by the numbers on the canvas —
 * yours, in the order you drew them — except for missing strokes, which you
 * didn't draw and so can only be named by the diagram's numbering.
 */
function Marking({ check }: { check: StrokeCheck }) {
  const correct = check.marks.filter((m) => m.verdict === 'correct').length
  const perfect = correct === check.expected && check.marks.length === check.expected
  const yours = (verdict: Verdict) =>
    check.marks.flatMap((m, i) => (m.verdict === verdict ? [{ drawn: i + 1, meant: m.matches }] : []))

  const lines: { kind: Verdict; label: string; detail: string }[] = []
  const order = yours('order')
  if (order.length) {
    lines.push({
      kind: 'order',
      label: 'Out of order',
      detail: order.map(({ drawn, meant }) => `${drawn} should come ${ordinal(meant! + 1)}`).join(', '),
    })
  }
  const pushSimple = (kind: Verdict, label: string) => {
    const found = yours(kind)
    if (found.length) lines.push({ kind, label, detail: found.map((f) => f.drawn).join(', ') })
  }
  pushSimple('reversed', 'Drawn backwards')
  pushSimple('loose', 'Shape or length off')
  pushSimple('off', 'Not part of this character')
  if (check.missing.length) {
    lines.push({
      kind: 'off',
      label: 'Missing',
      detail: `diagram's ${check.missing.map((j) => j + 1).join(', ')} — dashed in the box`,
    })
  }

  return (
    <div className="marking">
      <p className={`marking-head${perfect ? ' is-perfect' : ''}`}>
        {perfect
          ? `All ${check.expected} strokes right.`
          : `${correct} of ${check.expected} strokes right.`}
      </p>
      {lines.length > 0 && (
        <ul className="marking-issues">
          {lines.map(({ kind, label, detail }) => (
            <li key={label} className={`is-${kind}`}>
              <strong>{label}</strong> {detail}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Everything the stage row has to fit, in px. Mirrors PracticeSession.css. */
const MAX_CANVAS = 420
const ANSWER_WIDTH = 400 // .answer flex-basis, 25rem
const STAGE_GAP = 20 // .session-stage gap, 1.25rem
/**
 * Never share the row with the answer for less than this. A cramped box is
 * worse to write in than a stacked answer is to read, so below the threshold
 * the canvas takes the whole row and the answer wraps under it.
 */
const MIN_BESIDE_ANSWER = 340

function canvasSizeFor(stageWidth: number) {
  const beside = stageWidth - ANSWER_WIDTH - STAGE_GAP
  const available = beside >= MIN_BESIDE_ANSWER ? beside : stageWidth
  return Math.floor(Math.min(MAX_CANVAS, available))
}

/**
 * A larger box is genuinely easier to write a kanji in, so take the room when
 * the row has it. Strokes are stored normalised, so resizing doesn't invalidate
 * anything already drawn.
 *
 * <p>Measures the stage rather than the window: the box has to fit the row it
 * actually sits in, and a `window.innerWidth` breakpoint got that wrong twice —
 * it ignored the page's padding and max-width, and it only updated on `resize`,
 * so any layout change that moved the row without resizing the window left a
 * stale size behind.
 *
 * <p>Reserves the answer's width unconditionally, revealed or not, so the box
 * doesn't resize under your hand the moment you ask for the answer.
 */
function useCanvasSize() {
  const [stage, setStage] = useState<HTMLDivElement | null>(null)
  const [size, setSize] = useState(MAX_CANVAS)

  // Measures in the ref callback, which runs during commit, so the first paint
  // is already the right size rather than MAX_CANVAS corrected a frame later.
  // Safe to read layout here: the stage is sized by its parent, so the canvas
  // inside it can't feed back into the width being measured.
  const ref = useCallback((node: HTMLDivElement | null) => {
    setStage(node)
    if (node) {
      const width = node.getBoundingClientRect().width
      if (width > 0) setSize(canvasSizeFor(width))
    }
  }, [])

  useEffect(() => {
    if (!stage) return
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width
      // 0 while the element is detached or hidden; keep the last good size.
      if (width > 0) setSize(canvasSizeFor(width))
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [stage])

  return [ref, size] as const
}

export function PracticeSession() {
  const { me, loaded } = useUser()
  const [stageRef, canvasSize] = useCanvasSize()
  const [queue, setQueue] = useState<DueCard[] | null>(null)
  const [index, setIndex] = useState(0)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [revealed, setRevealed] = useState(false)
  const [error, setError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(0)

  // Held until /api/me answers, so the first queue is the length the user asked
  // for rather than a default that gets replaced a moment later.
  const load = useCallback(() => {
    if (!loaded) return
    setError(false)
    fetch(`/api/practice/due?limit=${me.sessionSize}`)
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
  }, [loaded, me.sessionSize])

  useEffect(load, [load])

  const card = queue?.[index]

  const reference = useMemo(
    () => (card?.strokeOrderSvg ? parseKanjiVg(card.strokeOrderSvg) : null),
    [card],
  )
  // Drawing is locked once revealed, so this runs once per card.
  const check = useMemo(
    () => (revealed && reference?.length ? checkStrokes(strokes, reference) : null),
    [revealed, reference, strokes],
  )
  const suggested = check ? suggestRating(check) : null

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
        <div className="focus is-wide">
          <p className="error">Couldn&rsquo;t reach the server.</p>
        </div>
      </Page>
    )
  }

  if (!queue) {
    return (
      <Page title="Write">
        <div className="focus is-wide">
          <p className="muted">Loading…</p>
        </div>
      </Page>
    )
  }

  if (queue.length === 0 || index >= queue.length) {
    return (
      <Page title="Write" subtitle="Handwriting practice.">
        <div className="focus is-wide">
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
        </div>
      </Page>
    )
  }

  return (
    <Page title="Write" subtitle="Read the clue, write the character, then check yourself.">
      <div className="focus is-wide">
        <div className="session-progress muted small">
          {index + 1} of {queue.length}
          {card?.isNew && <span className="tag-new">new</span>}
        </div>

        <div className="session">
          <section className="card prompt">
            <div className="prompt-clue">
              <h3 className="kicker">Write the Kanji For</h3>
              <p className="prompt-meaning">{card!.meanings.slice(0, 4).join(', ')}</p>
            </div>
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

          <div className="session-stage" ref={stageRef}>
            <div className="session-work">
              <div className="canvas-wrap" style={{ width: canvasSize, height: canvasSize }}>
                <WritingCanvas
                  strokes={strokes}
                  onChange={setStrokes}
                  size={canvasSize}
                  disabled={revealed}
                  showNumbers={revealed}
                  check={check}
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
                    <StrokeAnimation svg={card!.strokeOrderSvg} />
                  ) : (
                    <p className="muted small">No stroke diagram for this character.</p>
                  )}
                </div>
                {check ? (
                  <Marking check={check} />
                ) : (
                  <p className="muted small">
                    You drew {strokes.length}; it has {card!.strokeCount ?? '—'}. Your strokes are
                    numbered in the order you made them — compare them one by one against the
                    diagram.
                  </p>
                )}
              </section>
            )}
          </div>
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
                className={`btn rating rating-${rating.toLowerCase()}${
                  rating === suggested ? ' is-suggested' : ''
                }`}
                onClick={() => rate(rating)}
                disabled={saving}
              >
                <span className="rating-label">
                  {label}
                  {rating === suggested && <span className="rating-suggested">Suggested</span>}
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
