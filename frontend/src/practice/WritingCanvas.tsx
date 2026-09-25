import { useEffect, useRef } from 'react'
import type { StrokeCheck, Verdict } from './strokeCheck'

export type Point = { x: number; y: number }
export type Stroke = Point[]

type WritingCanvasProps = {
  strokes: Stroke[]
  /**
   * Takes an updater, not a value. Pointer events arrive faster than React
   * re-renders, so a handler reading `strokes` from its closure sees a stale
   * array — pointermove would then extend the *previous* stroke rather than the
   * one just started. Updating from the previous state is correct at any speed.
   */
  onChange: React.Dispatch<React.SetStateAction<Stroke[]>>
  /** CSS pixel size of the square drawing area. */
  size: number
  disabled?: boolean
  /**
   * Number each stroke at its starting point, in the order it was drawn. Shown
   * only when the answer is revealed — the whole point is to sit next to
   * KanjiVG's numbering and be compared against it, and during drawing the
   * labels would be noise.
   */
  showNumbers?: boolean
  /**
   * The marking, once revealed. Colours each stroke and its number by verdict,
   * and lays the reference faintly underneath, fitted to wherever the drawing
   * actually sits in the box.
   */
  check?: StrokeCheck | null
}

/** Token each verdict's number is drawn in. */
const VERDICT_TOKEN: Record<Verdict, string> = {
  correct: '--nn-matcha',
  loose: '--nn-yamabuki',
  order: '--nn-yamabuki',
  reversed: '--nn-yamabuki',
  off: '--nn-bengara',
}

type Placed = { x: number; y: number; leader: boolean }

/**
 * Where each stroke's number goes: beside its starting point, as close as it
 * can get without covering ink or another number.
 *
 * <p>Tries a ring of spots around the start, then a wider ring, and scores each:
 * covering ink costs most, touching an earlier badge nearly as much, and among
 * the clear spots the one behind the stroke's starting direction wins — which
 * is where KanjiVG puts its numbers too. A badge pushed out to the wider ring
 * gets a leader line back to its start so it can't be misread.
 */
function placeBadges(pixels: Point[][], size: number, radius: number, inkHalf: number): Placed[] {
  const segments: [Point, Point][] = []
  for (const stroke of pixels) {
    if (stroke.length === 1) segments.push([stroke[0], stroke[0]])
    for (let k = 1; k < stroke.length; k++) segments.push([stroke[k - 1], stroke[k]])
  }

  const inkDistance = (x: number, y: number) => {
    let best = Infinity
    for (const [a, b] of segments) {
      const vx = b.x - a.x
      const vy = b.y - a.y
      const lengthSquared = vx * vx + vy * vy
      const t =
        lengthSquared === 0
          ? 0
          : Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / lengthSquared))
      best = Math.min(best, Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t)))
    }
    return best
  }

  const placed: Placed[] = []
  const clearance = radius + inkHalf + 2
  const rings = [clearance, clearance * 1.8]

  for (const stroke of pixels) {
    if (stroke.length === 0) {
      placed.push({ x: -1, y: -1, leader: false })
      continue
    }
    const start = stroke[0]
    // The direction the stroke sets off in, read a badge-width along it so a
    // wobble at the very first pixel doesn't decide it.
    const ahead =
      stroke.find((p) => Math.hypot(p.x - start.x, p.y - start.y) > radius) ??
      stroke[stroke.length - 1]
    const away = Math.hypot(ahead.x - start.x, ahead.y - start.y)
    // A dot has no direction; prefer up and to the left.
    const behind =
      away < 1 ? Math.atan2(-1, -1) : Math.atan2(start.y - ahead.y, start.x - ahead.x)

    let best: Placed | null = null
    let bestCost = Infinity
    rings.forEach((distance, ring) => {
      for (let step = 0; step < 16; step++) {
        const angle = behind + (step * Math.PI) / 8
        const x = start.x + Math.cos(angle) * distance
        const y = start.y + Math.sin(angle) * distance
        if (x < radius + 1 || y < radius + 1 || x > size - radius - 1 || y > size - radius - 1) {
          continue
        }
        const turn = Math.abs(Math.atan2(Math.sin(angle - behind), Math.cos(angle - behind)))
        let cost = turn + ring * 2.5
        cost += Math.max(0, radius + inkHalf - inkDistance(x, y)) * 4
        for (const other of placed) {
          const gap = Math.hypot(x - other.x, y - other.y)
          cost += Math.max(0, radius * 2 + 2 - gap) * 3
        }
        if (cost < bestCost) {
          bestCost = cost
          best = { x, y, leader: ring > 0 }
        }
      }
    })
    // Every spot was off the canvas (a stroke started hard in a corner): sit on it.
    placed.push(
      best ?? {
        x: Math.min(size - radius, Math.max(radius, start.x)),
        y: Math.min(size - radius, Math.max(radius, start.y)),
        leader: false,
      },
    )
  }
  return placed
}

/**
 * A square you draw a kanji into.
 *
 * <p>Points are stored normalised to 0..1 rather than as pixels, so a drawing keeps
 * its meaning if the canvas is resized — and so it can later be compared against
 * KanjiVG's 109-unit coordinate space without depending on how big the box was on
 * screen when it was drawn.
 *
 * <p>Pointer events rather than mouse or touch events: one code path covers mouse,
 * finger and stylus, which matters because a tablet is where this feature is
 * actually pleasant to use.
 */
export function WritingCanvas({
  strokes,
  onChange,
  size,
  disabled,
  showNumbers,
  check,
}: WritingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    // Match the backing store to the device pixel ratio, or strokes look furry
    // on any screen that isn't exactly 1x.
    const ratio = window.devicePixelRatio || 1
    canvas.width = size * ratio
    canvas.height = size * ratio
    context.scale(ratio, ratio)
    context.clearRect(0, 0, size, size)

    const styles = getComputedStyle(canvas)
    const token = (name: string, fallback: string) =>
      styles.getPropertyValue(name).trim() || fallback
    const ink = token('--nn-jp', '#141110')
    const inkWidth = Math.max(3, size * 0.028)
    context.lineCap = 'round'
    context.lineJoin = 'round'

    const trace = (stroke: Point[]) => {
      context.beginPath()
      context.moveTo(stroke[0].x, stroke[0].y)
      for (const point of stroke.slice(1)) context.lineTo(point.x, point.y)
      // A single tap is a dot, not nothing.
      if (stroke.length === 1) context.lineTo(stroke[0].x + 0.01, stroke[0].y)
      context.stroke()
    }
    const toPixels = (stroke: Stroke) => stroke.map((p) => ({ x: p.x * size, y: p.y * size }))
    const marked = showNumbers && check ? check : null

    // The reference goes down first, under the ink and faint, fitted to wherever
    // the drawing sits. A stroke nobody drew is dashed in the error colour so the
    // gap shows where it belongs.
    if (marked) {
      const missing = new Set(marked.missing)
      marked.guide.forEach((stroke, index) => {
        if (stroke.length === 0) return
        const isMissing = missing.has(index)
        context.strokeStyle = isMissing
          ? token('--nn-bengara', '#b8433a')
          : token('--nn-line', '#e6c9c0')
        context.lineWidth = inkWidth * (isMissing ? 0.55 : 0.9)
        context.setLineDash(isMissing ? [inkWidth * 0.8, inkWidth * 1.2] : [])
        trace(toPixels(stroke))
      })
      context.setLineDash([])
    }

    const pixels = strokes.map(toPixels)
    const verdictOf = (index: number) => marked?.marks[index]?.verdict
    const colourOf = (index: number) => {
      const verdict = verdictOf(index)
      return verdict ? token(VERDICT_TOKEN[verdict], ink) : token('--nn-kaki', '#c9506b')
    }

    // Correct strokes stay ink; only the ones with something to say are coloured.
    context.lineWidth = inkWidth
    pixels.forEach((stroke, index) => {
      if (stroke.length === 0) return
      const verdict = verdictOf(index)
      context.strokeStyle = verdict && verdict !== 'correct' ? colourOf(index) : ink
      trace(stroke)
    })

    if (!showNumbers) return

    // Numbers are their own pass after every stroke, so no stroke can ever be
    // drawn over a number. Each is a solid badge rather than bare text: legible
    // wherever it lands — on ink, on a guide line, or on the box's grid.
    const radius = Math.max(9, size * 0.033)
    const halo = token('--nn-raised', '#fffaf8')
    const onAccent = token('--nn-on-accent', '#fff8f5')
    const places = placeBadges(pixels, size, radius, inkWidth / 2)

    const digits = strokes.length >= 10 ? 1.0 : 1.2
    context.font = `700 ${Math.round(radius * digits)}px ui-monospace, Menlo, monospace`
    context.textAlign = 'center'
    context.textBaseline = 'middle'

    pixels.forEach((stroke, index) => {
      if (stroke.length === 0) return
      const { x, y, leader } = places[index]
      const colour = colourOf(index)
      const start = stroke[0]

      if (leader) {
        const distance = Math.hypot(x - start.x, y - start.y)
        context.strokeStyle = colour
        context.lineWidth = 1.5
        context.beginPath()
        context.moveTo(start.x, start.y)
        context.lineTo(
          x - ((x - start.x) / distance) * radius,
          y - ((y - start.y) / distance) * radius,
        )
        context.stroke()
      }

      // Mark where the stroke began, so its direction reads without the diagram.
      context.fillStyle = colour
      context.beginPath()
      context.arc(start.x, start.y, Math.max(2.5, inkWidth * 0.3), 0, Math.PI * 2)
      context.fill()

      context.beginPath()
      context.arc(x, y, radius + 1.5, 0, Math.PI * 2)
      context.fillStyle = halo
      context.fill()
      context.beginPath()
      context.arc(x, y, radius, 0, Math.PI * 2)
      context.fillStyle = colour
      context.fill()
      context.fillStyle = onAccent
      // Nudged down a hair: 'middle' centres the em box, not the digits.
      context.fillText(String(index + 1), x, y + radius * 0.08)
    })
  }, [strokes, size, showNumbers, check])

  function pointFrom(event: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
    }
  }

  return (
    <canvas
      ref={canvasRef}
      className="writing-canvas"
      style={{ width: size, height: size }}
      aria-label="Drawing area"
      onPointerDown={(event) => {
        if (disabled) return
        // Capture so a stroke that leaves the box still ends cleanly. Guarded:
        // a pointer can already be gone by the time this runs.
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          /* capture is an optimisation, not a requirement */
        }
        drawingRef.current = true
        const point = pointFrom(event)
        onChange((previous) => [...previous, [point]])
      }}
      onPointerMove={(event) => {
        if (disabled || !drawingRef.current) return
        const point = pointFrom(event)
        onChange((previous) => {
          if (previous.length === 0) return previous
          const next = previous.slice()
          next[next.length - 1] = [...next[next.length - 1], point]
          return next
        })
      }}
      onPointerUp={(event) => {
        drawingRef.current = false
        try {
          event.currentTarget.releasePointerCapture(event.pointerId)
        } catch {
          /* already released */
        }
      }}
      onPointerCancel={() => {
        drawingRef.current = false
      }}
    />
  )
}
