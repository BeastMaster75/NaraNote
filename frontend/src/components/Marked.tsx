/**
 * Renders text with every occurrence of {@code needle} marked.
 *
 * <p>Built from split strings rather than injected HTML: the text is the user's
 * own, but assembling markup out of it would still be a needless injection
 * surface, and React escapes these for free.
 *
 * <p>Shared by the kanji page (mark the character in each sentence) and the
 * mining page (mark the word a sentence was saved under) so the two read as the
 * same idea rather than two similar ones.
 */
export function Marked({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>

  const parts: { text: string; hit: boolean }[] = []
  let rest = text
  let at = rest.indexOf(needle)
  while (at !== -1) {
    if (at > 0) parts.push({ text: rest.slice(0, at), hit: false })
    parts.push({ text: needle, hit: true })
    rest = rest.slice(at + needle.length)
    at = rest.indexOf(needle)
  }
  if (rest) parts.push({ text: rest, hit: false })

  return (
    <>
      {parts.map((part, index) =>
        part.hit ? (
          <mark key={index} className="hit">
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </>
  )
}
