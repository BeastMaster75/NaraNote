import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { stickyClass } from './sticky'
import './KanjiHoverCard.css'

type KanjiInfo = {
  literal: string
  strokeCount: number | null
  jlptLevel: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
}

/**
 * Hovering along a line of text asks for the same few characters over and over,
 * so each is fetched once per page load. A failed fetch is forgotten, so the next
 * hover tries again.
 */
const cache = new Map<string, Promise<KanjiInfo | null>>()

function loadKanji(literal: string) {
  let pending = cache.get(literal)
  if (!pending) {
    pending = fetch(`/api/kanji/${encodeURIComponent(literal)}`)
      .then((response) => (response.ok ? (response.json() as Promise<KanjiInfo>) : null))
      .catch(() => null)
      .then((info) => {
        if (!info) cache.delete(literal)
        return info
      })
    cache.set(literal, pending)
  }
  return pending
}

/** Readings as said, not as KANJIDIC marks them up — ひか.る is ひかる. */
function said(readings: string[], count: number) {
  return readings.slice(0, count).map((reading) => reading.replace(/\./g, '').replace(/^-|-$/g, ''))
}

export type HoveredKanji = {
  literal: string
  /** The sentence it sits in — filed along with it on Add. */
  sentence: string
  /** The word it sits in, and that word's reading here: 生 in 先生 is せんせい. */
  word: string
  reading: string | null
  anchor: DOMRect
}

const GAP = 10
const EDGE = 8

/**
 * A small note over a kanji you point at: the character, how it is read in this
 * sentence, what it means, and one click to add it. Mouse only — touch has no
 * hover, and a tap already opens the full panel beside the passage.
 */
export function KanjiHoverCard({
  hovered,
  inLibrary,
  source,
  onAdded,
  onPointerEnter,
  onPointerLeave,
}: {
  hovered: HoveredKanji
  inLibrary: boolean
  source: string
  onAdded: () => void
  onPointerEnter: () => void
  onPointerLeave: () => void
}) {
  const { literal } = hovered
  const [info, setInfo] = useState<KanjiInfo | null | undefined>(undefined)
  const [state, setState] = useState<'idle' | 'busy' | 'added' | 'error'>('idle')
  const card = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left: number; below: boolean } | null>(
    null,
  )

  // Keyed by literal where it's rendered, so a different character is a fresh
  // card — nothing here has to reset itself.
  useEffect(() => {
    let live = true
    loadKanji(literal).then((loaded) => live && setInfo(loaded))
    return () => {
      live = false
    }
  }, [literal])

  // Above the character, as asked — below only when there isn't room above.
  // Re-measured once the details arrive, since the card grows with them.
  useLayoutEffect(() => {
    const element = card.current
    if (!element) return
    const { width, height } = element.getBoundingClientRect()
    const { anchor } = hovered
    const below = anchor.top - GAP - height < EDGE
    const top = below ? anchor.bottom + GAP : anchor.top - GAP - height
    const centred = anchor.left + anchor.width / 2 - width / 2
    const left = Math.min(Math.max(centred, EDGE), window.innerWidth - width - EDGE)
    setPosition((previous) =>
      previous && previous.top === top && previous.left === left && previous.below === below
        ? previous
        : { top, left, below },
    )
  }, [hovered, info, state])

  async function add() {
    setState('busy')
    try {
      const response = await fetch(`/api/kanji/${encodeURIComponent(literal)}/sentences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sentence: hovered.sentence, source: source.trim() || null }),
      })
      if (!response.ok) throw new Error(String(response.status))
      setState('added')
      onAdded()
    } catch {
      setState('error')
    }
  }

  const showReading = hovered.reading && hovered.reading !== hovered.word
  const owned = inLibrary || state === 'added'

  return createPortal(
    <div
      ref={card}
      className={`kanji-hover${position?.below ? ' is-below' : ''}`}
      style={position ? { top: position.top, left: position.left } : { visibility: 'hidden' }}
      role="tooltip"
      onPointerEnter={onPointerEnter}
      onPointerLeave={onPointerLeave}
    >
      <div className={`kanji-hover-note ${stickyClass(literal.codePointAt(0) ?? 0)}`}>
        <div className="kanji-hover-head">
          <span className="kanji-hover-glyph" lang="ja">
            {literal}
          </span>
          <div className="kanji-hover-facts">
            {info?.jlptLevel ? <span className="kanji-hover-level">N{info.jlptLevel}</span> : null}
            {info?.strokeCount ? <span>{info.strokeCount} strokes</span> : null}
          </div>
        </div>

        {showReading && (
          <p className="kanji-hover-here" lang="ja">
            <span className="kanji-hover-word">{hovered.word}</span>
            <span className="kanji-hover-reading">{hovered.reading}</span>
          </p>
        )}

        {info === undefined ? (
          <p className="kanji-hover-quiet">Looking it up&hellip;</p>
        ) : info === null ? (
          <p className="kanji-hover-quiet">Not in the dictionary.</p>
        ) : (
          <>
            <p className="kanji-hover-meaning">{info.meanings.slice(0, 3).join(', ')}</p>
            <dl className="kanji-hover-readings" lang="ja">
              {info.onReadings.length > 0 && (
                <>
                  <dt>音</dt>
                  <dd>{said(info.onReadings, 2).join('・')}</dd>
                </>
              )}
              {info.kunReadings.length > 0 && (
                <>
                  <dt>訓</dt>
                  <dd>{said(info.kunReadings, 2).join('・')}</dd>
                </>
              )}
            </dl>
          </>
        )}

        <div className="kanji-hover-foot">
          {owned ? (
            <span className="kanji-hover-owned">
              {state === 'added' ? 'Added to Your Library' : 'In Your Library'}
            </span>
          ) : (
            <button
              type="button"
              className="kanji-hover-add"
              onClick={add}
              disabled={state === 'busy' || info === null}
            >
              {state === 'busy' ? 'Adding…' : state === 'error' ? 'Try Again' : 'Add to Library'}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
