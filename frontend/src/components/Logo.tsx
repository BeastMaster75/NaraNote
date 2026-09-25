type LogoProps = {
  /** Rendered width and height in px. The mark is drawn on a 64-unit box and
   *  scales cleanly; it was designed to stay legible down to 16. */
  size?: number
  /** Swap note and stroke colours. For the rare placement where the pink
   *  note sits too close to a surrounding accent. */
  reversed?: boolean
  /** Accessible name. Omit when the word "NaraNote" already sits beside the
   *  mark, so screen readers don't announce the brand twice. */
  label?: string
}

/**
 * The NaraNote mark: ナラ (nara) written on a note — the name, read as its two
 * halves. ナ is the full-size hero in two strokes; ラ sits small beside it, so
 * at favicon size the mark still reads as ナ on a page rather than mush.
 *
 * The note is a sticky page with its bottom-right corner folded over, which is
 * what separates "note" from a plain rounded tile. The fold sits below ラ so
 * the two never compete for the corner.
 *
 * Keep this in sync with the mark inside `assets/banner.svg`, which carries the
 * same geometry with literal colours. `frontend/public/favicon.svg` is the one
 * deliberate exception: a separate cut drawn for 16px browser tabs (cream rim,
 * no fold, heavier strokes) — see the comment in that file.
 */
export function Logo({ size = 40, reversed = false, label }: LogoProps) {
  const page = reversed ? 'var(--nn-brand-cream)' : 'var(--nn-brand-pink)'
  const fold = reversed ? 'var(--nn-brand-cream-deep)' : 'var(--nn-brand-pink-deep)'
  const ink = reversed ? 'var(--nn-brand-pink)' : 'var(--nn-brand-cream)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {/* The page, with its bottom-right corner cut away for the fold. */}
      <path
        d="M12 2 H52 A10 10 0 0 1 62 12 V47 L47 62 H12 A10 10 0 0 1 2 52 V12 A10 10 0 0 1 12 2 Z"
        fill={page}
      />
      {/* The folded-over corner. */}
      <path d="M62 47 L47 62 V53 A6 6 0 0 1 53 47 Z" fill={fold} />
      <g stroke={ink} strokeLinecap="round" strokeLinejoin="round" fill="none">
        {/* ナ */}
        <path d="M9 26 H35" strokeWidth="8.5" />
        <path d="M29.5 13.5 C29.5 29.5 28.5 38.5 17 46.5" strokeWidth="8.5" />
        {/* ラ, small */}
        <path d="M45.5 20.5 H55.5" strokeWidth="6.5" />
        <path d="M44.5 32.5 H56.5 C56.5 39 53 43.5 46 46" strokeWidth="6.5" />
      </g>
    </svg>
  )
}
