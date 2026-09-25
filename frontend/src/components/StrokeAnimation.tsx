import { useEffect, useMemo, useRef, useState } from 'react'
import { KANJIVG_SIZE, readKanjiVg } from '../practice/kanjiVg'
import './StrokeAnimation.css'

type StrokeAnimationProps = {
  /** A KanjiVG drawing as stored by the importer. */
  svg: string
  /** Starts drawing as soon as it appears. On by default. */
  autoPlay?: boolean
}

/** Playback speeds, cycled by the speed button. */
const SPEEDS = [1, 0.5, 2] as const

/**
 * Pacing, in ms at 1x. A stroke takes a fixed moment to land plus time for its
 * length, so a dot is quick and a long sweep is unhurried — close to how a hand
 * moves, rather than every stroke lasting the same.
 */
const LAND_MS = 160
const MS_PER_UNIT = 9
const PAUSE_MS = 220

/**
 * Slow to start, quicker through the middle, easing into the end: a brush
 * touching down and lifting off rather than a pen moving at constant speed.
 */
function ease(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

function lengthOf(points: { x: number; y: number }[]) {
  let total = 0
  for (let k = 1; k < points.length; k++) {
    total += Math.hypot(points[k].x - points[k - 1].x, points[k].y - points[k - 1].y)
  }
  return total
}

/** The point `fraction` of the way along a polyline, by length. */
function pointAlong(points: { x: number; y: number }[], fraction: number) {
  const target = lengthOf(points) * fraction
  let walked = 0
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1]
    const b = points[k]
    const segment = Math.hypot(b.x - a.x, b.y - a.y)
    if (walked + segment >= target && segment > 0) {
      const t = (target - walked) / segment
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
    walked += segment
  }
  return points[points.length - 1]
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/**
 * The character written out stroke by stroke, the way it should be — drawn
 * live from KanjiVG's own paths, so it is exact at any size and costs no media.
 *
 * <p>The whole character sits faintly underneath from the start, so each
 * stroke is seen landing in its place rather than appearing from nowhere. The
 * stroke being written is in the accent colour with a pen tip at its leading
 * end; it settles into ink once finished, and its number appears as it starts.
 * The finished frame is the same numbered diagram that stood here before.
 *
 * <p>Driven by one clock rather than a CSS animation per stroke, so it can be
 * paused, stepped a stroke at a time in either direction, and slowed down —
 * which is what you want when a stroke's direction is the thing in question.
 */
export function StrokeAnimation({ svg, autoPlay = true }: StrokeAnimationProps) {
  const strokes = useMemo(() => readKanjiVg(svg), [svg])

  const timeline = useMemo(() => {
    const entries: { start: number; end: number }[] = []
    for (const stroke of strokes) {
      const start = entries.length ? entries[entries.length - 1].end + PAUSE_MS : 0
      entries.push({ start, end: start + LAND_MS + lengthOf(stroke.points) * MS_PER_UNIT })
    }
    return entries
  }, [strokes])
  const total = timeline.length ? timeline[timeline.length - 1].end : 0

  // Reduced motion: start on the finished diagram and let stepping do the work.
  const still = prefersReducedMotion()
  const [elapsed, setElapsed] = useState(() => (still || !autoPlay ? total : 0))
  const [playing, setPlaying] = useState(() => autoPlay && !still)
  const [speedIndex, setSpeedIndex] = useState(0)
  const speed = SPEEDS[speedIndex]

  // A new character starts over. Adjusted during render, not in an effect, so
  // the old character's last frame never flashes with the new one's strokes.
  const [shown, setShown] = useState(svg)
  if (shown !== svg) {
    setShown(svg)
    setElapsed(still || !autoPlay ? total : 0)
    setPlaying(autoPlay && !still)
  }

  // The clock reads these on every frame; refs so a speed change or a step
  // doesn't restart it.
  const speedRef = useRef(speed)
  const elapsedRef = useRef(elapsed)
  useEffect(() => {
    speedRef.current = speed
    elapsedRef.current = elapsed
  })

  useEffect(() => {
    if (!playing) return
    let frame = 0
    let last = performance.now()
    const tick = (now: number) => {
      const next = Math.min(total, elapsedRef.current + (now - last) * speedRef.current)
      last = now
      elapsedRef.current = next
      setElapsed(next)
      if (next >= total) {
        setPlaying(false)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, total])

  /** Strokes fully written at a given moment. */
  const doneAt = (time: number) => timeline.filter((t) => t.end <= time).length
  const done = doneAt(elapsed)
  const inStroke = timeline.findIndex((t) => t.start < elapsed && elapsed < t.end)
  const finished = elapsed >= total

  const goTo = (count: number) => {
    setPlaying(false)
    const clamped = Math.max(0, Math.min(strokes.length, count))
    setElapsed(clamped === 0 ? 0 : timeline[clamped - 1].end)
  }

  const togglePlay = () => {
    if (playing) {
      setPlaying(false)
      return
    }
    if (finished) setElapsed(0)
    setPlaying(true)
  }

  // Counts the stroke under way as the current one, so the readout moves the
  // moment a stroke starts rather than when it ends.
  const current = inStroke >= 0 ? inStroke + 1 : done

  const tip =
    inStroke >= 0
      ? pointAlong(
          strokes[inStroke].points,
          ease((elapsed - timeline[inStroke].start) / (timeline[inStroke].end - timeline[inStroke].start)),
        )
      : null

  return (
    <div className="stroke-order stroke-anim">
      <div className="stroke-anim-stage">
        <svg
          className="stroke-anim-drawing"
          viewBox={`0 0 ${KANJIVG_SIZE} ${KANJIVG_SIZE}`}
          role="img"
          aria-label={`Stroke order, ${strokes.length} strokes`}
        >
          <desc>Stroke order from KanjiVG, (c) 2009-2011 Ulrich Apel, CC BY-SA 3.0.</desc>

          <g className="stroke-anim-ghost">
            {strokes.map((stroke, index) => (
              <path key={index} d={stroke.d} />
            ))}
          </g>

          <g className="stroke-anim-ink">
            {strokes.map((stroke, index) => {
              const { start, end } = timeline[index]
              if (elapsed <= start) return null
              const progress = Math.min(1, (elapsed - start) / (end - start))
              const drawn = ease(progress)
              return (
                <path
                  key={index}
                  d={stroke.d}
                  pathLength={1}
                  className={progress < 1 ? 'is-writing' : undefined}
                  // A dash as long as the part written so far, and a gap longer
                  // than the whole path so nothing else of it shows.
                  strokeDasharray={progress < 1 ? `${drawn} 2` : undefined}
                />
              )
            })}
          </g>

          {tip && <circle className="stroke-anim-tip" r={2.6} cx={tip.x} cy={tip.y} />}

          <g className="stroke-anim-numbers">
            {strokes.map((stroke, index) =>
              stroke.label && elapsed > timeline[index].start ? (
                <text
                  key={index}
                  x={stroke.label.x}
                  y={stroke.label.y}
                  className={index === inStroke ? 'is-current' : undefined}
                >
                  {index + 1}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      </div>

      <div className="stroke-anim-controls">
        <button
          type="button"
          className="stroke-anim-button"
          onClick={() => goTo(inStroke >= 0 ? done : done - 1)}
          disabled={elapsed === 0}
          aria-label="Previous stroke"
          title="Previous stroke"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 5v14M18 5l-9 7 9 7z" />
          </svg>
        </button>
        <button
          type="button"
          className="stroke-anim-button is-main"
          onClick={togglePlay}
          aria-label={playing ? 'Pause' : finished ? 'Replay' : 'Play'}
          title={playing ? 'Pause' : finished ? 'Replay' : 'Play'}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            {playing ? (
              <path d="M8 5v14M16 5v14" />
            ) : finished ? (
              <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" />
            ) : (
              <path d="M7 4.5v15l12-7.5z" />
            )}
          </svg>
        </button>
        <button
          type="button"
          className="stroke-anim-button"
          onClick={() => goTo(done + 1)}
          disabled={finished}
          aria-label="Next stroke"
          title="Next stroke"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M18 5v14M6 5l9 7-9 7z" />
          </svg>
        </button>

        <span className="stroke-anim-count" aria-live="polite">
          {current} / {strokes.length}
        </span>

        <button
          type="button"
          className="stroke-anim-button is-speed"
          onClick={() => setSpeedIndex((i) => (i + 1) % SPEEDS.length)}
          aria-label={`Speed ${speed}x`}
          title="Change speed"
        >
          {speed === 0.5 ? '½' : speed}×
        </button>
      </div>
    </div>
  )
}
