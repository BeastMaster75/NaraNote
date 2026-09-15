import { useEffect, useRef } from 'react'

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

    const ink = getComputedStyle(canvas).getPropertyValue('--nn-jp').trim()
    context.strokeStyle = ink || '#141110'
    context.lineWidth = Math.max(3, size * 0.028)
    context.lineCap = 'round'
    context.lineJoin = 'round'

    for (const stroke of strokes) {
      if (stroke.length === 0) continue
      context.beginPath()
      context.moveTo(stroke[0].x * size, stroke[0].y * size)
      for (const point of stroke.slice(1)) {
        context.lineTo(point.x * size, point.y * size)
      }
      // A single tap is a dot, not nothing.
      if (stroke.length === 1) context.lineTo(stroke[0].x * size + 0.01, stroke[0].y * size)
      context.stroke()
    }

    if (!showNumbers) return

    const styles = getComputedStyle(canvas)
    const accent = styles.getPropertyValue('--nn-kaki').trim() || '#c9506b'
    const halo = styles.getPropertyValue('--nn-raised').trim() || '#fffaf8'
    const fontSize = Math.max(11, size * 0.05)

    context.font = `600 ${fontSize}px ui-monospace, Menlo, monospace`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.lineJoin = 'round'

    strokes.forEach((stroke, index) => {
      if (stroke.length === 0) return
      const start = stroke[0]

      // Push the label back along the direction the stroke set off in, so it sits
      // clear of the ink rather than on top of it.
      const ahead = stroke[Math.min(stroke.length - 1, 3)]
      let dx = start.x - ahead.x
      let dy = start.y - ahead.y
      const length = Math.hypot(dx, dy)
      if (length < 0.001) {
        // A dot has no direction; put the label up and to the left.
        dx = -0.7
        dy = -0.7
      } else {
        dx /= length
        dy /= length
      }

      const offset = fontSize * 0.9
      const margin = fontSize * 0.75
      const x = Math.min(size - margin, Math.max(margin, start.x * size + dx * offset))
      const y = Math.min(size - margin, Math.max(margin, start.y * size + dy * offset))

      // Halo first so the number stays readable where it overlaps a stroke.
      context.lineWidth = Math.max(3, fontSize * 0.28)
      context.strokeStyle = halo
      context.strokeText(String(index + 1), x, y)
      context.fillStyle = accent
      context.fillText(String(index + 1), x, y)
    })
  }, [strokes, size, showNumbers])

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
