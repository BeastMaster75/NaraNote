/** Sticky-note colours (styles/sticky.css), cycled through any run of notes. */
const TONES = ['sakura', 'moegi', 'yamabuki', 'fuji'] as const

/** The classes for the note at this position in a run: `sticky tone-…`. */
export function stickyClass(index: number) {
  return `sticky tone-${TONES[index % TONES.length]}`
}

/** A hand-placed look: every note a little off straight, never two alike in a row. */
const TILTS = [-2.2, 1.6, -1.1, 2.4, -1.7, 0.9, 2, -2.6, 1.2, -0.8]

/** The tilt for the note at this position in a run, as a CSS angle. */
export function stickyTilt(index: number) {
  return `${TILTS[index % TILTS.length]}deg`
}
