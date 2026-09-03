type LogoProps = {
  /** Rendered width and height in px. The mark is drawn on a 64-unit box and
   *  scales cleanly; it was designed to stay legible down to 16. */
  size?: number
  /** Swap tile and stroke colours. For the rare placement where the persimmon
   *  tile sits too close to a surrounding accent. */
  reversed?: boolean
  /** Accessible name. Omit when the word "NaraNote" already sits beside the
   *  mark, so screen readers don't announce the brand twice. */
  label?: string
}

/**
 * The NaraNote mark: katakana ナ (na), the first sound of the name, in two
 * strokes. Two rather than 奈's eight, because eight strokes turn to mud at
 * favicon size — the same legibility problem the app itself is about.
 *
 * Keep this in sync with `frontend/public/favicon.svg`, which carries the
 * same geometry with literal colours (a favicon can't read CSS variables).
 */
export function Logo({ size = 40, reversed = false, label }: LogoProps) {
  const tile = reversed ? 'var(--nn-brand-cream)' : 'var(--nn-brand-persimmon)'
  const ink = reversed ? 'var(--nn-brand-persimmon)' : 'var(--nn-brand-cream)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <rect width="64" height="64" rx="17" fill={tile} />
      <path
        d="M13 27 H51"
        stroke={ink}
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M41 15 C41 32 40 42 27 50"
        stroke={ink}
        strokeWidth="8"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
