import type { Point, Stroke } from './WritingCanvas'

/**
 * Reading the KanjiVG drawings stored in `kanji_stroke_order`.
 *
 * <p>Shared by the marking, which needs each stroke as points, and the stroke
 * animation, which needs the original path data and the diagram's own number
 * positions. Regex rather than DOMParser: the input is our own import's output
 * with a fixed shape, and this keeps the module runnable outside a browser.
 */

/** KanjiVG draws in a fixed 109-unit square. */
export const KANJIVG_SIZE = 109

export type KanjiVgStroke = {
  /** The path exactly as KanjiVG drew it, in 109-unit space. */
  d: string
  /** The same path walked into a polyline, in 109-unit space. */
  points: Point[]
  /** Where KanjiVG puts this stroke's number (text baseline, left), if it does. */
  label: Point | null
}

/**
 * Every stroke in stroke order, with its number's position.
 *
 * <p>Sorted by the `-sN` in each path's id rather than trusted to document
 * order: KanjiVG nests strokes inside component groups, and a component split
 * around another one (the two halves of 衣 around 口 in 哀) puts them out of
 * sequence in the file.
 */
export function readKanjiVg(svg: string): KanjiVgStroke[] {
  const paths: { order: number; d: string }[] = []
  for (const tag of svg.match(/<path\b[^>]*>/g) ?? []) {
    const d = /\sd="([^"]*)"/.exec(tag)?.[1]
    if (!d) continue
    const order = Number(/-s(\d+)"/.exec(tag)?.[1] ?? paths.length + 1)
    paths.push({ order, d })
  }
  paths.sort((a, b) => a.order - b.order)

  // <text transform="matrix(1 0 0 1 36.75 13.50)">1</text> — the number is the
  // text, so labels line up with strokes by value, not by position in the file.
  const labels = new Map<number, Point>()
  const text = /<text[^>]*matrix\(1 0 0 1 (-?[\d.]+) (-?[\d.]+)\)[^>]*>\s*(\d+)\s*<\/text>/g
  for (const match of svg.matchAll(text)) {
    labels.set(Number(match[3]), { x: Number(match[1]), y: Number(match[2]) })
  }

  return paths.map(({ d }, index) => ({
    d,
    points: samplePath(d),
    label: labels.get(index + 1) ?? null,
  }))
}

/** The strokes of a KanjiVG drawing, in stroke order, normalised to 0..1. */
export function parseKanjiVg(svg: string): Stroke[] {
  return readKanjiVg(svg).map(({ points }) =>
    points.map((p) => ({ x: p.x / KANJIVG_SIZE, y: p.y / KANJIVG_SIZE })),
  )
}

/**
 * Walks an SVG path into a polyline. Covers the commands KanjiVG actually uses —
 * M, C and S in both cases, which is every path in the set — plus L, H, V and Z
 * so a stray one degrades to a straight segment instead of being dropped.
 */
export function samplePath(d: string): Point[] {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  const points: Point[] = []
  let i = 0
  let command = ''
  let x = 0
  let y = 0
  let startX = 0
  let startY = 0
  // The last control point, for S's reflection.
  let controlX = 0
  let controlY = 0

  const number = () => Number(tokens[i++])
  const isNumber = () => i < tokens.length && !/^[a-zA-Z]$/.test(tokens[i])

  const cubic = (x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
    const steps = 12
    for (let s = 1; s <= steps; s++) {
      const t = s / steps
      const u = 1 - t
      points.push({
        x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
        y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
      })
    }
    controlX = x2
    controlY = y2
    x = x3
    y = y3
  }

  while (i < tokens.length) {
    if (!isNumber()) command = tokens[i++]
    const relative = command === command.toLowerCase()
    const ox = relative ? x : 0
    const oy = relative ? y : 0

    switch (command.toUpperCase()) {
      case 'M': {
        x = ox + number()
        y = oy + number()
        startX = x
        startY = y
        points.push({ x, y })
        // Extra pairs after a moveto are implicit linetos.
        command = relative ? 'l' : 'L'
        break
      }
      case 'L':
        x = ox + number()
        y = oy + number()
        points.push({ x, y })
        break
      case 'H':
        x = ox + number()
        points.push({ x, y })
        break
      case 'V':
        y = oy + number()
        points.push({ x, y })
        break
      case 'C': {
        const x1 = ox + number()
        const y1 = oy + number()
        const x2 = ox + number()
        const y2 = oy + number()
        const x3 = ox + number()
        const y3 = oy + number()
        cubic(x1, y1, x2, y2, x3, y3)
        continue
      }
      case 'S': {
        // Reflect the previous control point. After anything but a curve that
        // point was reset to the current one, which is what the spec asks for.
        const x1 = 2 * x - controlX
        const y1 = 2 * y - controlY
        const x2 = ox + number()
        const y2 = oy + number()
        const x3 = ox + number()
        const y3 = oy + number()
        cubic(x1, y1, x2, y2, x3, y3)
        continue
      }
      case 'Z':
        x = startX
        y = startY
        points.push({ x, y })
        break
      default:
        // Unknown command: skip its arguments rather than loop forever.
        while (isNumber()) i++
        break
    }
    // Anything but a curve resets the reflection point.
    controlX = x
    controlY = y
  }
  return points
}
