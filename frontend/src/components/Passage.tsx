import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { KanjiHoverCard, type HoveredKanji } from './KanjiHoverCard'
import './Passage.css'

/** Long enough that sweeping the pointer across a line doesn't flash a card at
 *  every character; short enough that resting on one feels immediate. */
const OPEN_DELAY = 280
/** Room to travel from the character up onto the card without it vanishing. */
const CLOSE_DELAY = 220

export type PassageToken = {
  surface: string
  reading: string | null
  content: boolean
}
export type PassageSentence = { tokens: PassageToken[] }

/** A word read back wrong, underlined in place. Keyed `sentence:token` in {@link PassageProps.marks}. */
export type PassageMark = {
  type: 'misread' | 'skipped'
  heard: string
  /** What to play when asked how it should sound — null on every token of a word but its
   *  last, so a word split across tokens gets one button, not one per piece. */
  say: string | null
  word: string
}

/** Ruby over kana is noise — only annotate a word that actually contains kanji. */
export function hasKanji(text: string) {
  return /[㐀-鿿]/.test(text)
}

export function sentenceText(sentence: PassageSentence) {
  return sentence.tokens.map((token) => token.surface).join('')
}

type PassageProps = {
  sentences: PassageSentence[]
  furigana: boolean
  /** Kanji already in the user's library — dims them so the passage reads as a
   *  diff of what's new. */
  library: Set<string>
  /** The tapped character (and which sentence it was tapped in, since the same
   *  character can appear more than once) — drives the .is-selected highlight. */
  selected: { literal: string; sentence: string } | null
  onKanjiTap: (literal: string, sentence: string) => void
  /** Sentence indexes to keep at full contrast; every other sentence dims. Omit
   *  (Mining does) to leave every sentence at full contrast. */
  activeSentenceIndexes?: Set<number>
  /** Read's check result. Omitted everywhere else. */
  marks?: Map<string, PassageMark>
  onSay?: (text: string) => void
  /** Turns on the card that appears over a kanji you point at. `source` is
   *  filed with the sentence on Add, as a tap does. */
  hoverCard?: { source: string; onAdded: () => void }
}

/**
 * Furigana-and-tap-a-kanji rendering, extracted out of Mining so Read can share
 * it exactly rather than re-implementing the same ruby/button markup a second
 * time with its own subtly different bugs.
 */
export function Passage({
  sentences,
  furigana,
  library,
  selected,
  onKanjiTap,
  activeSentenceIndexes,
  marks,
  onSay,
  hoverCard,
}: PassageProps) {
  const [hovered, setHovered] = useState<HoveredKanji | null>(null)
  const openTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)

  function pointAt(event: PointerEvent<HTMLButtonElement>, kanji: Omit<HoveredKanji, 'anchor'>) {
    // Mouse only: a touch "hover" is the start of a tap, and a tap opens the panel.
    if (!hoverCard || event.pointerType !== 'mouse') return
    window.clearTimeout(closeTimer.current)
    window.clearTimeout(openTimer.current)
    const target = event.currentTarget
    const show = () => setHovered({ ...kanji, anchor: target.getBoundingClientRect() })
    // Already showing one: moving to the next character swaps straight over.
    if (hovered) show()
    else openTimer.current = window.setTimeout(show, OPEN_DELAY)
  }

  function leave() {
    window.clearTimeout(openTimer.current)
    closeTimer.current = window.setTimeout(() => setHovered(null), CLOSE_DELAY)
  }

  function stay() {
    window.clearTimeout(closeTimer.current)
  }

  // The card is placed against where the character was when it opened, so any
  // scroll would leave it floating over the wrong text. Escape dismisses it too.
  useEffect(() => {
    if (!hovered) return
    const close = () => setHovered(null)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && close()
    window.addEventListener('scroll', close, true)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [hovered])

  useEffect(
    () => () => {
      window.clearTimeout(openTimer.current)
      window.clearTimeout(closeTimer.current)
    },
    [],
  )

  return (
    <div className="sentences">
      {sentences.map((sentence, index) => {
        const whole = sentenceText(sentence)
        const dimmed = activeSentenceIndexes !== undefined && !activeSentenceIndexes.has(index)
        return (
          <p key={index} className={`sentence jp jp-ruby${dimmed ? ' is-dim' : ''}`}>
            {sentence.tokens.map((token, tokenIndex) => {
              // Characters are the targets, but the word still owns the
              // reading — so the targets go *inside* the ruby base rather
              // than replacing it. That keeps furigana while making each
              // kanji individually tappable.
              const chars = [...token.surface].map((char, charIndex) =>
                hasKanji(char) ? (
                  <button
                    key={charIndex}
                    type="button"
                    className={[
                      'tok',
                      'tok-kanji',
                      library.has(char) && 'is-known',
                      selected?.literal === char && selected?.sentence === whole && 'is-selected',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      window.clearTimeout(openTimer.current)
                      setHovered(null)
                      onKanjiTap(char, whole)
                    }}
                    onPointerEnter={(event) =>
                      pointAt(event, {
                        literal: char,
                        sentence: whole,
                        word: token.surface,
                        reading: token.reading,
                      })
                    }
                    onPointerLeave={leave}
                  >
                    {char}
                  </button>
                ) : (
                  <span key={charIndex} className={token.content ? undefined : 'tok tok-grammar'}>
                    {char}
                  </span>
                ),
              )

              const word =
                furigana && token.reading && hasKanji(token.surface) ? (
                  <ruby key={tokenIndex}>
                    {chars}
                    <rt>{token.reading}</rt>
                  </ruby>
                ) : (
                  <span key={tokenIndex}>{chars}</span>
                )

              const mark = marks?.get(`${index}:${tokenIndex}`)
              if (!mark) return word

              // A separate button rather than making the word itself clickable: the kanji
              // inside it are already buttons, and one tap can't mean both "look this up"
              // and "say it".
              return (
                <span
                  key={tokenIndex}
                  className={`tok-mark is-${mark.type}`}
                  title={mark.type === 'skipped' ? 'Skipped' : `Heard ${mark.heard}`}
                >
                  {word}
                  {mark.say && (
                    <button
                      type="button"
                      className="tok-say"
                      onClick={() => onSay?.(mark.say!)}
                      aria-label={`Hear ${mark.word} said correctly`}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M11 5 6 9H2v6h4l5 4z M15.5 8.5a5 5 0 0 1 0 7" />
                      </svg>
                    </button>
                  )}
                </span>
              )
            })}
          </p>
        )
      })}

      {hoverCard && hovered && (
        <KanjiHoverCard
          key={hovered.literal + hovered.sentence}
          hovered={hovered}
          inLibrary={library.has(hovered.literal)}
          source={hoverCard.source}
          onAdded={hoverCard.onAdded}
          onPointerEnter={stay}
          onPointerLeave={leave}
        />
      )}
    </div>
  )
}
