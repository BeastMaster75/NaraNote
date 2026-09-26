/**
 * Where a word sits in its sentence. Mined sentences hold the word as it was
 * written, which for verbs and adjectives is rarely the dictionary form —
 * 眩しい appears as 眩しくて — so trailing kana are shed until the stem matches.
 */
function findInSentence(sentence: string, term: string) {
  for (let stem = term; stem.length > 0; stem = stem.slice(0, -1)) {
    const at = sentence.indexOf(stem)
    if (at >= 0) return { at, length: stem.length }
    if (!/[ぁ-ゖ]$/.test(stem)) break
  }
  return null
}

/**
 * A sentence with its word marked by a highlighter stroke (`.nn-marker` in
 * index.css) — the way you'd mark a book, and the one look every page uses for
 * "this is the word you saved, here is where you met it".
 */
export function Highlighted({ sentence, term }: { sentence: string; term: string }) {
  const hit = findInSentence(sentence, term)
  if (!hit) return <>{sentence}</>
  return (
    <>
      {sentence.slice(0, hit.at)}
      <mark className="nn-marker">{sentence.slice(hit.at, hit.at + hit.length)}</mark>
      {sentence.slice(hit.at + hit.length)}
    </>
  )
}
