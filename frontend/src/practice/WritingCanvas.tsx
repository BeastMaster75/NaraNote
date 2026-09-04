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
export function WritingCanvas({ strokes, onChange, size, disabled }: WritingCanvasProps) {
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
  }, [strokes, size])

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
