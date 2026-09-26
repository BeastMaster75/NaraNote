import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router'
import { BatchAddModal } from './BatchAddModal'
import { KanjiFilterBar } from '../components/KanjiFilterBar'
import { Page } from '../components/Page'
import './Library.css'
import { stickyClass, stickyTilt } from '../components/sticky'

type KanjiEntry = {
  literal: string
  strokeCount: number | null
  grade: number | null
  jlptLevel: number | null
  frequency: number | null
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
  addedAt: string
}

type SortKey = 'added' | 'grade' | 'frequency' | 'strokes' | 'jlpt'

const SORT_LABELS: Record<SortKey, string> = {
  added: 'Recently Added',
  grade: 'Grade',
  frequency: 'Frequency',
  strokes: 'Strokes',
  jlpt: 'JLPT Level',
}

function sortValue(entry: KanjiEntry, key: SortKey): number | null {
  switch (key) {
    case 'grade':
      return entry.grade
    case 'frequency':
      return entry.frequency
    case 'strokes':
      return entry.strokeCount
    case 'jlpt':
      return entry.jlptLevel
    default:
      return null
  }
}

/**
 * One on and one kun reading, as said rather than as KANJIDIC marks them up —
 * ひか.る is ひかる and -ぞ.い is ぞい on a note. Every reading, with the
 * okurigana boundary, is one click away on the kanji's own page.
 */
function noteReadings(entry: KanjiEntry) {
  return [entry.onReadings[0], entry.kunReadings[0]]
    .filter(Boolean)
    .map((reading) => reading.replace(/\./g, '').replace(/^-|-$/g, ''))
    .join('・')
}

/**
 * The kanji wall.
 *
 * <p>This page used to carry a Words tab as well, duplicating a list that also
 * existed under Review. Words are managed in the deck they belong to now — a
 * word without its source is just an entry in one undifferentiated pile — and
 * Anki export moved next to each deck. What's left is the thing this page is
 * actually good at: every character you've chosen to study, at a glance.
 */
export function Library() {
  const [kanji, setKanji] = useState<KanjiEntry[] | null>(null)
  const [error, setError] = useState(false)
  const [jlptLevel, setJlptLevel] = useState<number | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<SortKey>('added')

  const reload = useCallback(() => {
    fetch('/api/library')
      .then((r) => (r.ok ? (r.json() as Promise<KanjiEntry[]>) : Promise.reject()))
      .then(setKanji)
      .catch(() => setError(true))
  }, [])

  useEffect(reload, [reload])

  const savedSet = useMemo(
    () => new Set(kanji?.map((entry) => entry.literal) ?? []),
    [kanji]
  )

  const filteredKanji = useMemo(() => {
    if (!kanji) return kanji
    const q = search.trim().toLowerCase()
    let list = kanji.filter((entry) => {
      if (jlptLevel !== null && entry.jlptLevel !== jlptLevel) return false
      if (!q) return true
      if (entry.literal === search.trim()) return true
      return [...entry.meanings, ...entry.onReadings, ...entry.kunReadings]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
    if (sort !== 'added') {
      // JLPT sorts easiest (N5) first, matching how a learner actually thinks
      // about their own collection; grade/frequency/strokes sort lowest-first
      // for the same reason — lower is more basic in all three.
      list = [...list].sort((a, b) => {
        const av = sortValue(a, sort)
        const bv = sortValue(b, sort)
        if (av === null && bv === null) return 0
        if (av === null) return 1
        if (bv === null) return -1
        return sort === 'jlpt' ? bv - av : av - bv
      })
    }
    return list
  }, [kanji, jlptLevel, search, sort])

  const stats = useMemo(() => {
    if (!kanji) return null
    const byLevel: Record<number, number> = {}
    let unrated = 0
    for (const entry of kanji) {
      if (entry.jlptLevel) byLevel[entry.jlptLevel] = (byLevel[entry.jlptLevel] ?? 0) + 1
      else unrated++
    }
    return { byLevel, unrated }
  }, [kanji])

  async function removeKanji(literal: string) {
    await fetch(`/api/library/${encodeURIComponent(literal)}`, { method: 'DELETE' })
    reload()
  }

  return (
    <Page
      title="Collection"
      subtitle="Every character you have chosen to study."
    >
      {error && <p className="error">Couldn&rsquo;t reach the server.</p>}

      {kanji === null ? (
        <p className="muted">Loading&hellip;</p>
      ) : kanji.length === 0 ? (
        <section className="card">
          <h3 className="kicker">No Kanji Yet</h3>
          <p className="muted">
            Find a character on the <Link to="/kanji">kanji page</Link> and add it here, or
            click a kanji inside one of your saved words. Words themselves live in their
            decks under <Link to="/review">Review</Link>.
          </p>
          <div className="library-empty-actions">
            <BatchAddModal savedLiterals={savedSet} onDone={reload} variant="primary" />
          </div>
        </section>
      ) : (
        <>
          <div className="library-toolbar">
            <div className="library-toolbar-row">
              <input
                className="library-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search meaning, reading, or literal…"
                aria-label="Search your collection"
              />
              <select
                className="library-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as SortKey)}
                aria-label="Sort by"
              >
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
              <KanjiFilterBar jlptLevel={jlptLevel} onJlptLevelChange={setJlptLevel} />
              <BatchAddModal savedLiterals={savedSet} onDone={reload} />
            </div>

            <p className="library-stats muted small">
              {filteredKanji && filteredKanji.length !== kanji.length
                ? `${filteredKanji.length} of ${kanji.length} shown`
                : `${kanji.length} ${kanji.length === 1 ? 'character' : 'characters'}`}
              {stats &&
                [5, 4, 3, 2, 1]
                  .filter((level) => stats.byLevel[level])
                  .map((level) => ` · N${level} ${stats.byLevel[level]}`)
                  .join('')}
              {stats && stats.unrated > 0 && ` · unrated ${stats.unrated}`}
            </p>
          </div>

          {filteredKanji?.length === 0 && (
            <p className="muted small">Nothing matches — try a different search or level.</p>
          )}

          <ul className="library-grid">
            {filteredKanji?.map((entry, index) => (
              <li
                key={entry.literal}
                className="library-cell"
                style={{ '--tilt': stickyTilt(index) } as CSSProperties}
              >
                {/* Into your own sentences, not the dictionary entry: from the
                    collection the interesting question is where you met it. The
                    full entry is one link away on that page. */}
                <Link
                  to={`/collection/${entry.literal}`}
                  className={`library-card ${stickyClass(index)}`}
                >
                  <span className="library-glyph jp" lang="ja">
                    {entry.literal}
                  </span>
                  <span className="sticky-caption library-meaning">
                    {entry.meanings.slice(0, 3).join(', ') || '—'}
                  </span>
                  <span className="library-readings jp-sm" lang="ja">
                    {noteReadings(entry) || '—'}
                  </span>
                  <span className="library-facts">
                    {[
                      entry.jlptLevel && `N${entry.jlptLevel}`,
                      entry.strokeCount && `${entry.strokeCount} strokes`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </Link>
                <button
                  type="button"
                  className="row-delete"
                  aria-label={`Remove ${entry.literal}`}
                  onClick={() => removeKanji(entry.literal)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </Page>
  )
}
