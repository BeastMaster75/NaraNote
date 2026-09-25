import type { Point, Stroke } from './WritingCanvas'

/**
 * Marks a drawn kanji against its KanjiVG reference, stroke by stroke.
 *
 * <p>Where the character sits in the box, and how big it is, don't count. Both
 * drawings are reduced to their own frame first — centred on their bounding box
 * and scaled by its longer side — and the fit is then tightened with a
 * least-squares alignment over the strokes that matched. A kanji drawn small in
 * a corner marks the same as one filling the box.
 *
 * <p>What does count is what a teacher would mark: the right strokes, in the
 * right order, in the right direction, roughly where they belong relative to
 * each other.
 */

/**
 * - `correct` — the stroke it should be, at this point in the order.
 * - `order` — a real stroke of the character, drawn out of sequence.
 * - `loose` — recognisably the right stroke, but its shape or length is off
 *   enough to matter. This is what tells 未 from 末 and 士 from 土, which share
 *   every stroke and differ only in proportion.
 * - `reversed` — the right stroke, drawn from the wrong end.
 * - `off` — doesn't resemble any stroke that is still unaccounted for.
 */
export type Verdict = 'correct' | 'order' | 'loose' | 'reversed' | 'off'

export type StrokeMark = {
  verdict: Verdict
  /** Index into the reference strokes this one was matched to, if any. */
  matches: number | null
}

export type StrokeCheck = {
  /** One mark per drawn stroke, in drawing order. */
  marks: StrokeMark[]
  /** Reference stroke indices nobody drew. */
  missing: number[]
  /** How many strokes the character has. */
  expected: number
  /**
   * The reference strokes, moved into the canvas's 0..1 space so they lie over
   * the drawing wherever it was made. For showing what was meant, in place.
   */
  guide: Stroke[]
  /** Correct strokes over the larger of drawn and expected. 0..1. */
  score: number
}

/** Points per stroke once resampled. Enough to tell a hook from a straight line. */
const SAMPLES = 24

/**
 * Mean point distance, in units of the character's size, beyond which a stroke
 * is not the stroke it was matched to. Tuned against synthetic wobble: honest
 * handwriting of the right stroke sits well under 0.1; a neighbouring stroke of
 * the same character is typically 0.2 or more away.
 */
const MATCH_LIMIT = 0.16

/**
 * Past this distance a matched stroke is `loose` rather than `correct`. Neat
 * handwriting sits around 0.03; noticeably sloppy handwriting has a median near
 * 0.05 and rarely passes 0.1.
 */
const LOOSE_LIMIT = 0.1

/**
 * How far a stroke's length may stray from the reference's, as a ratio, before
 * it is `loose`. Distance alone can't see proportion: 末's long top line sits
 * only ~0.07 from 未's short one, inside honest wobble, but is 1.5x its length.
 */
const LENGTH_RATIO = 1.4

/**
 * Below this length (in character units) a stroke is a dot, and which end it
 * started from is too fine to judge reliably from a mouse or a finger.
 */
const MIN_DIRECTED_LENGTH = 0.12

type Frame = { cx: number; cy: number; scale: number }

// ---------------------------------------------------------------------------
// Geometry

function frameOf(strokes: Stroke[]): Frame {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const stroke of strokes) {
    for (const p of stroke) {
      minX = Math.min(minX, p.x)
      minY = Math.min(minY, p.y)
      maxX = Math.max(maxX, p.x)
      maxY = Math.max(maxY, p.y)
    }
  }
  if (minX === Infinity) return { cx: 0.5, cy: 0.5, scale: 1 }
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    // Guard a single dot, which has no extent to scale by.
    scale: Math.max(maxX - minX, maxY - minY, 0.02),
  }
}

function toFrame(stroke: Stroke, frame: Frame): Stroke {
  return stroke.map((p) => ({ x: (p.x - frame.cx) / frame.scale, y: (p.y - frame.cy) / frame.scale }))
}

function fromFrame(stroke: Stroke, frame: Frame): Stroke {
  return stroke.map((p) => ({ x: p.x * frame.scale + frame.cx, y: p.y * frame.scale + frame.cy }))
}

function lengthOf(stroke: Stroke): number {
  let total = 0
  for (let k = 1; k < stroke.length; k++) {
    total += Math.hypot(stroke[k].x - stroke[k - 1].x, stroke[k].y - stroke[k - 1].y)
  }
  return total
}

/** Evenly spaced along the stroke's length, so speed of drawing doesn't matter. */
function resample(stroke: Stroke, n = SAMPLES): Stroke {
  if (stroke.length === 0) return []
  const total = lengthOf(stroke)
  if (total === 0 || stroke.length === 1) return Array.from({ length: n }, () => ({ ...stroke[0] }))

  const step = total / (n - 1)
  const out: Point[] = [{ ...stroke[0] }]
  let carried = 0
  for (let k = 1; k < stroke.length && out.length < n; k++) {
    const a = stroke[k - 1]
    const b = stroke[k]
    const segment = Math.hypot(b.x - a.x, b.y - a.y)
    if (segment === 0) continue
    let at = step - carried
    while (at <= segment && out.length < n) {
      const t = at / segment
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })
      at += step
    }
    carried = segment - (at - step)
  }
  // Float drift can leave the last sample unplaced.
  while (out.length < n) out.push({ ...stroke[stroke.length - 1] })
  return out
}

function meanDistance(a: Stroke, b: Stroke): number {
  let sum = 0
  for (let k = 0; k < a.length; k++) sum += Math.hypot(a[k].x - b[k].x, a[k].y - b[k].y)
  return sum / a.length
}

type Transform = { scaleX: number; scaleY: number; dx: number; dy: number }

const IDENTITY: Transform = { scaleX: 1, scaleY: 1, dx: 0, dy: 0 }

function apply(stroke: Stroke, t: Transform): Stroke {
  return stroke.map((p) => ({ x: p.x * t.scaleX + t.dx, y: p.y * t.scaleY + t.dy }))
}

/**
 * The scale-and-shift that best lays `from` over `to`, point for point. Each
 * axis may stretch a little on its own — a character written slightly wide is
 * still written right — but not by more than a quarter against the other, or a
 * squashed drawing would be forgiven into a different shape.
 */
function fit(from: Point[], to: Point[]): Transform {
  if (from.length < 2) return IDENTITY
  const n = from.length
  let fx = 0
  let fy = 0
  let tx = 0
  let ty = 0
  for (let k = 0; k < n; k++) {
    fx += from[k].x
    fy += from[k].y
    tx += to[k].x
    ty += to[k].y
  }
  fx /= n
  fy /= n
  tx /= n
  ty /= n

  let sxx = 0
  let syy = 0
  let cxx = 0
  let cyy = 0
  for (let k = 0; k < n; k++) {
    const ax = from[k].x - fx
    const ay = from[k].y - fy
    sxx += ax * ax
    syy += ay * ay
    cxx += ax * (to[k].x - tx)
    cyy += ay * (to[k].y - ty)
  }
  if (sxx + syy < 1e-9) return IDENTITY

  const uniform = (cxx + cyy) / (sxx + syy)
  if (uniform <= 0) return IDENTITY
  // An axis with almost no spread (一 has no height) can't estimate its own scale.
  const clamp = (value: number, spread: number) =>
    spread < 1e-4 ? uniform : Math.min(uniform * 1.25, Math.max(uniform / 1.25, value))
  const scaleX = clamp(cxx / sxx, sxx / n)
  const scaleY = clamp(cyy / syy, syy / n)
  return { scaleX, scaleY, dx: tx - scaleX * fx, dy: ty - scaleY * fy }
}

// ---------------------------------------------------------------------------
// Matching

/**
 * Minimum-cost one-to-one assignment of rows to columns (Hungarian method,
 * Jonker–Volgenant form). Rectangular matrices are padded; a row left on a
 * padding column comes back as -1.
 */
function assign(cost: number[][], rows: number, cols: number): number[] {
  const n = Math.max(rows, cols)
  const PAD = 1e6
  const at = (r: number, c: number) => (r < rows && c < cols ? cost[r][c] : PAD)

  const u = new Array(n + 1).fill(0)
  const v = new Array(n + 1).fill(0)
  const p = new Array(n + 1).fill(0)
  const way = new Array(n + 1).fill(0)
  for (let r = 1; r <= n; r++) {
    p[0] = r
    let c0 = 0
    const minv = new Array(n + 1).fill(Infinity)
    const used = new Array(n + 1).fill(false)
    do {
      used[c0] = true
      const r0 = p[c0]
      let delta = Infinity
      let c1 = 0
      for (let c = 1; c <= n; c++) {
        if (used[c]) continue
        const current = at(r0 - 1, c - 1) - u[r0] - v[c]
        if (current < minv[c]) {
          minv[c] = current
          way[c] = c0
        }
        if (minv[c] < delta) {
          delta = minv[c]
          c1 = c
        }
      }
      for (let c = 0; c <= n; c++) {
        if (used[c]) {
          u[p[c]] += delta
          v[c] -= delta
        } else {
          minv[c] -= delta
        }
      }
      c0 = c1
    } while (p[c0] !== 0)
    do {
      const c1 = way[c0]
      p[c0] = p[c1]
      c0 = c1
    } while (c0)
  }

  const result = new Array(rows).fill(-1)
  for (let c = 1; c <= n; c++) {
    const r = p[c] - 1
    if (r < rows && c - 1 < cols) result[r] = c - 1
  }
  return result
}

/**
 * Which of `sequence` are in order: the longest strictly increasing run through
 * it, by position. Everything else was drawn out of sequence. Using the longest
 * run rather than "is stroke i matched to reference i" means one skipped stroke
 * costs one mark, not a mark on every stroke after it.
 */
function inOrder(sequence: number[]): Set<number> {
  const n = sequence.length
  const best = new Array(n).fill(1)
  const previous = new Array(n).fill(-1)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < i; j++) {
      if (sequence[j] < sequence[i] && best[j] + 1 > best[i]) {
        best[i] = best[j] + 1
        previous[i] = j
      }
    }
  }
  let end = -1
  for (let i = 0; i < n; i++) if (end === -1 || best[i] > best[end]) end = i
  const kept = new Set<number>()
  for (let i = end; i !== -1; i = previous[i]) kept.add(i)
  return kept
}

// ---------------------------------------------------------------------------

export function checkStrokes(drawn: Stroke[], reference: Stroke[]): StrokeCheck {
  const drawnFrame = frameOf(drawn)
  const referenceFrame = frameOf(reference)

  const user = drawn.map((s) => resample(toFrame(s, drawnFrame)))
  const target = reference.map((s) => resample(toFrame(s, referenceFrame)))
  const reversedTarget = target.map((s) => s.slice().reverse())
  const targetLength = target.map(lengthOf)

  let transform = IDENTITY
  let matched: number[] = []
  let forward: number[][] = []
  let backward: number[][] = []

  // Match, align on what matched, and match again: the bounding box is a rough
  // first guess — one stroke poking out too far skews it — and the fit over
  // matched strokes corrects that. Two rounds are enough to settle.
  for (let round = 0; round < 3; round++) {
    const aligned = user.map((s) => apply(s, transform))
    forward = aligned.map((s) => target.map((t) => meanDistance(s, t)))
    backward = aligned.map((s) => reversedTarget.map((t) => meanDistance(s, t)))
    const cost = forward.map((row, i) => row.map((f, j) => Math.min(f, backward[i][j])))
    matched = assign(cost, user.length, target.length)

    const from: Point[] = []
    const to: Point[] = []
    matched.forEach((j, i) => {
      if (j < 0 || cost[i][j] > MATCH_LIMIT * 1.5) return
      const t = backward[i][j] < forward[i][j] ? reversedTarget[j] : target[j]
      from.push(...user[i])
      to.push(...t)
    })
    if (round === 2 || from.length === 0) break
    transform = fit(from, to)
  }

  const marks: StrokeMark[] = drawn.map((_, i) => {
    const j = matched[i]
    if (j === undefined || j < 0) return { verdict: 'off', matches: null }
    const best = Math.min(forward[i][j], backward[i][j])
    if (best > MATCH_LIMIT) return { verdict: 'off', matches: null }
    const backwards =
      targetLength[j] >= MIN_DIRECTED_LENGTH && backward[i][j] < forward[i][j]
    if (backwards) return { verdict: 'reversed', matches: j }

    // Measured over a coarse resample so hand tremor, which adds length without
    // adding reach, doesn't read as a stroke drawn too long.
    const ratio =
      lengthOf(resample(apply(user[i], transform), 6)) / lengthOf(resample(target[j], 6))
    const misproportioned =
      targetLength[j] >= MIN_DIRECTED_LENGTH && (ratio > LENGTH_RATIO || ratio < 1 / LENGTH_RATIO)
    const loose = best > LOOSE_LIMIT || misproportioned
    return { verdict: loose ? 'loose' : 'correct', matches: j }
  })

  // Order is judged only among strokes that were recognised at all.
  const recognised = marks.flatMap((m, i) => (m.matches === null ? [] : [i]))
  const kept = inOrder(recognised.map((i) => marks[i].matches!))
  recognised.forEach((i, position) => {
    if (!kept.has(position)) marks[i] = { ...marks[i], verdict: 'order' }
  })

  const taken = new Set(marks.flatMap((m) => (m.matches === null ? [] : [m.matches])))
  const missing = reference.flatMap((_, j) => (taken.has(j) ? [] : [j]))

  // Reference → drawing: undo the fit, then place in the drawing's own frame.
  const guide = target.length
    ? reference.map((s) => {
        const local = toFrame(s, referenceFrame)
        const unfit = local.map((p) => ({
          x: (p.x - transform.dx) / transform.scaleX,
          y: (p.y - transform.dy) / transform.scaleY,
        }))
        return fromFrame(unfit, drawn.length ? drawnFrame : referenceFrame)
      })
    : []

  const correct = marks.filter((m) => m.verdict === 'correct').length
  const denominator = Math.max(drawn.length, reference.length, 1)
  return { marks, missing, expected: reference.length, guide, score: correct / denominator }
}
