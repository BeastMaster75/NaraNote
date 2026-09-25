import { useCallback, useEffect, useState } from 'react'

type FitOptions = {
  /** Smallest tile, in px. Below it the grid shows whole rows and clips the rest. */
  min: number
  /** Largest tile, in px — a handful of kanji shouldn't become posters. */
  max: number
  /** The grid's gap, in px. Must match its CSS. */
  gap: number
}

/**
 * The largest square tile at which every item fits the box, or the smallest
 * size if none does.
 */
function tileFor(width: number, height: number, count: number, { min, max, gap }: FitOptions) {
  if (count === 0) return min
  for (let size = max; size > min; size -= 2) {
    const columns = Math.floor((width + gap) / (size + gap))
    if (columns === 0) continue
    const rows = Math.ceil(count / columns)
    if (rows * (size + gap) - gap <= height) return size
  }
  return min
}

/**
 * The rows the tiles actually occupy, capped at what fits. Declared exactly —
 * rather than auto-filling the box with row tracks — so rows the items don't
 * use don't exist, and the ones they do can be centred in the box instead of
 * sitting at the top above a strip of empty tracks.
 */
function rowsFor(width: number, height: number, count: number, size: number, gap: number) {
  // Room for a two-line empty message.
  if (count === 0) return 2
  const columns = Math.max(1, Math.floor((width + gap) / (size + gap)))
  const fit = Math.max(1, Math.floor((height + gap) / (size + gap)))
  return Math.min(Math.ceil(count / columns), fit)
}

/**
 * Tiles that grow to fill their box when there are few of them and shrink back
 * toward `min` as there are more — so a grid of kanji is never a short row
 * floating in an empty card.
 *
 * <p>Attach the ref to the grid itself, whose box must come from its container
 * (flex: 1 1 0 or similar), not from its tiles — otherwise the measurement feeds
 * back into itself. Measured with clientWidth/Height, which a CSS transform on an
 * ancestor can't distort, and in the ref callback as well as by the observer so
 * the first paint is already the right size.
 *
 * <p>Set the results as `--tile` (px) and `--rows` on the grid and use
 * `grid-template-rows: repeat(var(--rows), var(--tile))`.
 */
export function useFitTiles(count: number, options: FitOptions) {
  const { min, max, gap } = options
  const [ref, box] = useBox()
  const size = box ? tileFor(box.width, box.height, count, { min, max, gap }) : min
  const rows = box ? rowsFor(box.width, box.height, count, size, gap) : 3
  return [ref, { size, rows }] as const
}

/**
 * The list version: fixed-height rows, as many as there are items up to what
 * fits. Set the result as `--rows` and use
 * `grid-template-rows: repeat(var(--rows), <row height>)`, so a short list has
 * only its own rows and can be centred rather than hanging above empty tracks.
 */
export function useFitRows(count: number, rowHeight: number) {
  const [ref, box] = useBox()
  const fit = box ? Math.max(1, Math.floor(box.height / rowHeight)) : 3
  // Room for a two-line empty message.
  const rows = count === 0 ? 2 : Math.min(count, fit)
  return [ref, rows] as const
}

/** The element's layout size, kept current. See useFitTiles for the rules. */
function useBox() {
  const [node, setNode] = useState<HTMLElement | null>(null)
  const [box, setBox] = useState<{ width: number; height: number } | null>(null)

  const measure = useCallback((element: HTMLElement) => {
    const width = element.clientWidth
    const height = element.clientHeight
    if (width <= 0 || height <= 0) return
    setBox((previous) =>
      previous && previous.width === width && previous.height === height
        ? previous
        : { width, height },
    )
  }, [])

  const ref = useCallback(
    (element: HTMLElement | null) => {
      setNode(element)
      if (element) measure(element)
    },
    [measure],
  )

  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver(() => measure(node))
    observer.observe(node)
    return () => observer.disconnect()
  }, [node, measure])

  return [ref, box] as const
}
