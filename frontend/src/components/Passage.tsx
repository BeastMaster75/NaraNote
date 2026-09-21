import './Passage.css'

export type PassageToken = {
  surface: string
  reading: string | null
  content: boolean
}
export type PassageSentence = { tokens: PassageToken[] }

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
}: PassageProps) {
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
                    onClick={() => onKanjiTap(char, whole)}
                  >
                    {char}
                  </button>
                ) : (
                  <span key={charIndex} className={token.content ? undefined : 'tok tok-grammar'}>
                    {char}
                  </span>
                ),
              )

              return furigana && token.reading && hasKanji(token.surface) ? (
                <ruby key={tokenIndex}>
                  {chars}
                  <rt>{token.reading}</rt>
                </ruby>
              ) : (
                <span key={tokenIndex}>{chars}</span>
              )
            })}
          </p>
        )
      })}
    </div>
  )
}
