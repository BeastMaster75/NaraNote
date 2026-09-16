import './KanjiFilterBar.css'

const JLPT_LEVELS = [5, 4, 3, 2, 1]

type KanjiFilterBarProps = {
  jlptLevel: number | null
  onJlptLevelChange: (level: number | null) => void
}

/**
 * A small, reusable filter row for kanji lists — JLPT today, room for more
 * facets (grade, frequency) later without becoming Collection-specific markup.
 */
export function KanjiFilterBar({ jlptLevel, onJlptLevelChange }: KanjiFilterBarProps) {
  return (
    <div className="kanji-filter-bar">
      <button
        type="button"
        className={`kanji-filter-chip${jlptLevel === null ? ' is-on' : ''}`}
        onClick={() => onJlptLevelChange(null)}
      >
        All
      </button>
      {JLPT_LEVELS.map((level) => (
        <button
          key={level}
          type="button"
          className={`kanji-filter-chip${jlptLevel === level ? ' is-on' : ''}`}
          onClick={() => onJlptLevelChange(level)}
        >
          N{level}
        </button>
      ))}
    </div>
  )
}
