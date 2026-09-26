import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '../components/Page'
import { Highlighted } from '../components/Highlighted'
import { stickyClass } from '../components/sticky'
import { useBox } from '../components/useFitTiles'
import { TaskPanel, type Suggestion, type Task } from '../tasks/TaskPanel'
import { useUser } from '../user/UserContext'
import './Home.css'

type ActivityDay = {
  date: string
  drawn: number
  reviewed: number
  added: number
}

type RecentWord = {
  id: number
  term: string
  reading: string | null
  meaning: string
  sentence: string | null
  source: string | null
  createdAt: string
}

type RecentKanji = {
  literal: string
  meanings: string[]
  onReadings: string[]
  kunReadings: string[]
  addedAt: string
}

/**
 * The source RecognitionWordService stamps on words it generates from library
 * kanji. Those were never met in anything you read — adding 川 brings in
 * さんずの川 and friends — so they are left out of everything on this page.
 * Letting them fill the note wall buried the kanji you had actually mined.
 */
const GENERATED_SOURCE = 'Reading'

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

/** Gap between activity cells, in px. Mirrors Home.css. */
const CELL_GAP = 4
/** Never less than a quarter of a year, never more than a whole one. */
const MIN_WEEKS = 13
const MAX_WEEKS = 53

/**
 * Cell size follows the screen's height — 14px on a 720px laptop, 21px on 1080p
 * — so the band stays a band and never crowds out the row above it.
 */
function cellFor(viewportHeight: number) {
  return Math.max(11, Math.min(26, Math.floor(viewportHeight / 50)))
}

type ActivityLayout = { weeks: number; cell: number }

/**
 * As many weeks as the strip's width holds at the current cell size, so a wide
 * screen shows more of the year instead of bigger squares.
 *
 * <p>Measures the grid element, whose width comes from its column rather than
 * its cells, so the measurement can't feed back into itself. Measured in the ref
 * callback as well as by the observer, so the first paint is already right.
 */
function useActivityLayout() {
  const [node, setNode] = useState<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<ActivityLayout>({ weeks: 26, cell: 14 })

  // clientWidth, not getBoundingClientRect: layout size, which a CSS transform
  // on an ancestor (an animation, say) can't distort.
  const measure = useCallback((element: HTMLElement) => {
    const width = element.clientWidth
    if (width <= 0) return
    const cell = cellFor(window.innerHeight)
    const weeks = Math.max(
      MIN_WEEKS,
      Math.min(MAX_WEEKS, Math.floor((width + CELL_GAP) / (cell + CELL_GAP))),
    )
    setLayout((previous) =>
      previous.weeks === weeks && previous.cell === cell ? previous : { weeks, cell },
    )
  }, [])

  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      setNode(element)
      if (element) measure(element)
    },
    [measure],
  )

  useEffect(() => {
    if (!node) return
    const observer = new ResizeObserver(() => measure(node))
    observer.observe(node)
    // Height alone changes the cell size without touching the grid's width.
    const onResize = () => measure(node)
    window.addEventListener('resize', onResize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onResize)
    }
  }, [node, measure])

  return [ref, layout] as const
}

/** "Last Year", or "Last 7 Months" for however many weeks are showing. */
function rangeLabel(weeks: number) {
  if (weeks >= 50) return 'Your Year'
  const months = Math.round(weeks / 4.345)
  return `Last ${months} Months`
}

const SAMPLE =
  'その古い家の窓から、山吹色の光が漏れていた。彼は毎朝六時に起きて、川沿いを走ることにしている。'

function dayKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

/**
 * One column per week, Monday-first, ending on the Sunday of the current week —
 * so today always sits in the last column rather than drifting by weekday.
 */
function stripWeeks(count: number) {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // getDay() is Sunday-first; shift to a Monday-first index, then run on to that
  // week's Sunday. Six minus the index, not seven — seven lands on the Monday
  // after, which slides every row one place off its weekday label.
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)))

  const weeks: Date[][] = []
  for (let week = count - 1; week >= 0; week -= 1) {
    const column: Date[] = []
    for (let day = 6; day >= 0; day -= 1) {
      const date = new Date(end)
      date.setDate(end.getDate() - (week * 7 + day))
      column.push(date)
    }
    weeks.push(column)
  }
  return weeks
}

/**
 * A month name over the column where each month starts, which is what makes the
 * strip readable without a label per date. Skipped when it would land within
 * three columns of the previous one — at laptop widths the cells are ~13px,
 * and two labels that close ran together ("MARAPR").
 */
function monthLabels(weeks: Date[][]) {
  let last = -Infinity
  return weeks.map((week, index) => {
    const starts = index === 0 || week[0].getMonth() !== weeks[index - 1][0].getMonth()
    if (!starts || index - last < 3) return ''
    last = index
    return week[0].toLocaleString(undefined, { month: 'short' })
  })
}

/**
 * True once loading has taken long enough that an empty page would be worse
 * than one filling in — a slow or unreachable backend shouldn't leave a blank
 * screen.
 */
function useSlowLoad(ms = 700) {
  const [slow, setSlow] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), ms)
    return () => window.clearTimeout(timer)
  }, [ms])
  return slow
}

function greeting(hour: number) {
  if (hour < 5) return 'Up late'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/**
 * A name worth saying out loud: the account's display name falls back to the
 * email address, and "Good evening, fares@example.com" reads like a form letter.
 */
function firstName(displayName: string) {
  if (!displayName || displayName === 'local' || displayName.includes('@')) return null
  return displayName.split(/\s+/)[0]
}

/** Days since the epoch, local calendar — the same number all day. */
function dayNumber() {
  const today = new Date()
  return Math.floor(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) / 86_400_000)
}

type Featured = { kind: 'word'; word: RecentWord } | { kind: 'kanji'; kanji: RecentKanji }

/**
 * The same pick all day, a different one tomorrow. A word with its sentence
 * when there is one — the sentence is the point of the tile — and otherwise a
 * kanji, so a collection of characters alone still has something to show.
 */
function featuredOfTheDay(words: RecentWord[], kanji: RecentKanji[]): Featured | null {
  const withSentence = words.filter((word) => word.sentence)
  if (withSentence.length > 0) {
    return { kind: 'word', word: withSentence[dayNumber() % withSentence.length] }
  }
  if (kanji.length > 0) return { kind: 'kanji', kanji: kanji[dayNumber() % kanji.length] }
  return null
}

function savedAgo(createdAt: string, now: number) {
  const days = Math.floor((now - new Date(createdAt).getTime()) / 86_400_000)
  if (days <= 0) return 'saved today'
  if (days === 1) return 'saved yesterday'
  if (days < 30) return `saved ${days} days ago`
  const months = Math.round(days / 30)
  return `saved ${months} ${months === 1 ? 'month' : 'months'} ago`
}

/** A hand-placed look: every note a little off straight, never two alike in a row. */
const TILTS = [-2.2, 1.6, -1.1, 2.4, -1.7, 0.9, 2, -2.6, 1.2, -0.8]

/** Note size and gap, in px. Mirrors .notes in Home.css. */
const NOTE = { width: 148, height: 104, gap: 14 }
/** However few notes there are, they stop growing here — big, not posters. */
const NOTE_MAX_SCALE = 1.8

type NoteLayout = {
  columns: number
  rows: number
  /** 1 when the wall is full; above 1 when a few notes are grown to fill it. */
  scale: number
  /** How many notes fit. */
  capacity: number
  /** A small collection: notes are sized to fit, with a "collect more" note after them. */
  fitted: boolean
}

/**
 * A full wall packs minimum-size notes and stretches the rows to the height. A
 * short one — five kanji on a new account — would sit in one corner of an
 * empty strip, so instead its notes (plus the "collect more" note) grow to the
 * largest size at which they all fit, trying every row count for the best.
 */
function noteLayout(box: { width: number; height: number } | null, count: number): NoteLayout {
  if (!box) return { columns: 4, rows: 1, scale: 1, capacity: 4, fitted: false }
  const { width, height } = box
  const columns = Math.max(1, Math.floor((width + NOTE.gap) / (NOTE.width + NOTE.gap)))
  const rows = Math.max(1, Math.floor((height + NOTE.gap) / (NOTE.height + NOTE.gap)))
  const capacity = columns * rows
  if (count >= capacity) return { columns, rows, scale: 1, capacity, fitted: false }

  const items = count + 1
  let best = { columns, rows, scale: 1 }
  for (let r = 1; r <= rows; r += 1) {
    const c = Math.ceil(items / r)
    if (c > columns) continue
    const scale = Math.min(
      (width - NOTE.gap * (c - 1)) / c / NOTE.width,
      (height - NOTE.gap * (r - 1)) / r / NOTE.height,
      NOTE_MAX_SCALE,
    )
    if (scale > best.scale) best = { columns: c, rows: r, scale }
  }
  return { ...best, capacity, fitted: true }
}

type NoteItem =
  | { kind: 'word'; key: string; word: RecentWord }
  | { kind: 'kanji'; key: string; kanji: RecentKanji }

/**
 * Words and kanji in one line, newest first, so whatever you collected last is
 * the first note on the wall whichever kind it was.
 */
function byRecency(words: RecentWord[], kanji: RecentKanji[]): NoteItem[] {
  const items: (NoteItem & { at: number })[] = [
    ...words.map((word) => ({
      kind: 'word' as const,
      key: `w${word.id}`,
      word,
      at: new Date(word.createdAt).getTime(),
    })),
    ...kanji.map((entry) => ({
      kind: 'kanji' as const,
      key: `k${entry.literal}`,
      kanji: entry,
      at: new Date(entry.addedAt).getTime(),
    })),
  ]
  return items.sort((a, b) => b.at - a.at)
}

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`
}

export function Home() {
  const navigate = useNavigate()
  const { me } = useUser()
  // null until first loaded. The page stays hidden until every one of these has
  // arrived: shown straight away, it painted its empty states and then rebuilt
  // itself piece by piece as five requests landed at different moments.
  const [activity, setActivity] = useState<Map<string, ActivityDay> | null>(null)
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [words, setWords] = useState<RecentWord[] | null>(null)
  const [kanji, setKanji] = useState<RecentKanji[] | null>(null)
  const loaded = !!(activity && tasks && suggestions && words && kanji)
  const slow = useSlowLoad()
  const [text, setText] = useState('')
  const [source, setSource] = useState('')
  // Read once: "this week" and "saved 3 days ago" don't need to tick while the
  // page is open, and the clock is not something to read on every render.
  const [now] = useState(() => Date.now())

  const [activityRef, { weeks: weekCount, cell }] = useActivityLayout()
  const weeks = stripWeeks(weekCount)
  const days = weeks.flat()

  // The strip spans several calendar months and /api/activity is per-month, so
  // fetch each month it touches and merge them into one lookup. Keyed on the
  // months rather than the dates, which are rebuilt from the clock every render.
  const monthsKey = [...new Set(days.map(monthKey))].join(',')
  useEffect(() => {
    const months = monthsKey.split(',')
    let cancelled = false
    Promise.all(
      months.map((month) =>
        fetch(`/api/activity?month=${month}`)
          .then((response) => (response.ok ? (response.json() as Promise<ActivityDay[]>) : []))
          .catch(() => [] as ActivityDay[]),
      ),
    ).then((results) => {
      if (cancelled) return
      setActivity(new Map(results.flat().map((day) => [day.date, day])))
    })
    return () => {
      cancelled = true
    }
  }, [monthsKey])

  const reload = useCallback(() => {
    fetch('/api/tasks')
      .then((response) => (response.ok ? (response.json() as Promise<Task[]>) : []))
      .catch(() => [] as Task[])
      .then(setTasks)
    fetch('/api/tasks/suggestions')
      .then((response) => (response.ok ? (response.json() as Promise<Suggestion[]>) : []))
      .catch(() => [] as Suggestion[])
      .then(setSuggestions)
  }, [])

  useEffect(reload, [reload])

  useEffect(() => {
    fetch('/api/vocab')
      .then((response) => (response.ok ? (response.json() as Promise<RecentWord[]>) : []))
      .catch(() => [] as RecentWord[])
      .then(setWords)
    fetch('/api/library')
      .then((response) => (response.ok ? (response.json() as Promise<RecentKanji[]>) : []))
      .catch(() => [] as RecentKanji[])
      .then(setKanji)
  }, [])

  const todayKey = dayKey(new Date())

  const totals = [...(activity ?? new Map<string, ActivityDay>()).values()].reduce(
    (sum, day) => ({
      drawn: sum.drawn + day.drawn,
      reviewed: sum.reviewed + day.reviewed,
      added: sum.added + day.added,
    }),
    { drawn: 0, reviewed: 0, added: 0 },
  )

  const openTasksByDate = new Map<string, number>()
  for (const task of tasks ?? []) {
    if (!task.dueDate || task.done) continue
    openTasksByDate.set(task.dueDate, (openTasksByDate.get(task.dueDate) ?? 0) + 1)
  }

  const mined = (words ?? []).filter((word) => word.source !== GENERATED_SOURCE)
  const weekAgo = now - 7 * 86_400_000
  const wordsThisWeek = mined.filter((word) => new Date(word.createdAt).getTime() >= weekAgo).length
  const kanjiThisWeek = (kanji ?? []).filter(
    (entry) => new Date(entry.addedAt).getTime() >= weekAgo,
  ).length
  const featured = featuredOfTheDay(mined, kanji ?? [])
  const notes = byRecency(mined.slice(0, 60), (kanji ?? []).slice(0, 60))

  const [notesRef, notesBox] = useBox()
  const wall = noteLayout(notesBox, notes.length)
  const shownNotes = notes.slice(0, wall.capacity)
  const captureRef = useRef<HTMLTextAreaElement>(null)

  const name = firstName(me.displayName)

  function mine(input: string) {
    if (!input.trim()) return
    // Router state rather than a query string: a mined passage is a paragraph,
    // and paragraphs of Japanese make for a hostile URL.
    navigate('/mine', {
      state: { text: input, source: source.trim() || null },
    })
  }

  return (
    <Page>
      {/* Hidden, not unmounted, while loading: the grids still lay out, so the
          note and cell counts are already right when it appears. */}
      <div className={`home${loaded || slow ? ' is-ready' : ''}`} aria-busy={!loaded}>
        <header className="home-head">
          <p className="home-greeting">
            {greeting(new Date().getHours())}
            {name && `, ${name}`}
          </p>
          <h2 className="home-headline">
            {wordsThisWeek > 0 && kanjiThisWeek > 0 ? (
              <>
                You collected{' '}
                <Scribble>
                  {plural(wordsThisWeek, 'word', 'words')} and {kanjiThisWeek} kanji
                </Scribble>{' '}
                this week
              </>
            ) : wordsThisWeek > 0 ? (
              <>
                You met <Scribble>{plural(wordsThisWeek, 'new word', 'new words')}</Scribble> this
                week
              </>
            ) : kanjiThisWeek > 0 ? (
              <>
                You collected <Scribble>{kanjiThisWeek} new kanji</Scribble> this week
              </>
            ) : (
              <>
                Collect the Japanese <Scribble>you meet</Scribble>
              </>
            )}
          </h2>
        </header>

        <div className="bento">
          <section className="tile capture">
            <h3 className="tile-title">What Did You Read Today?</h3>
            <textarea
              ref={captureRef}
              className="capture-text jp"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="日本語をここに貼り付けてください"
              aria-label="Japanese text to mine"
            />
            <div className="capture-actions">
              <input
                className="capture-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Where it's from (optional)"
                aria-label="Source"
              />
              <button type="button" className="btn" onClick={() => mine(SAMPLE)}>
                Try an Example
              </button>
              <button
                type="button"
                className="btn is-primary"
                onClick={() => mine(text)}
                disabled={!text.trim()}
              >
                Mine It
              </button>
            </div>
          </section>

          <FeaturedTile featured={featured} now={now} onTry={() => mine(SAMPLE)} />

          <StatTiles suggestions={suggestions ?? []} />

          <section className="notes-area">
            <header className="notes-head">
              <h3 className="tile-title">Recently Collected</h3>
              <Link to="/collection" className="notes-all">
                See All
              </Link>
            </header>
            <ul
              className={`notes${wall.fitted ? ' is-fitted' : ''}`}
              ref={notesRef}
              style={
                {
                  '--columns': wall.columns,
                  '--rows': wall.rows,
                  '--note-scale': wall.scale,
                } as CSSProperties
              }
            >
              {shownNotes.map((note, index) => (
                <Note key={note.key} note={note} index={index} />
              ))}
              {notes.length === 0 ? (
                <li className="notes-empty muted">
                  Paste something above and the words you keep will land here.
                </li>
              ) : (
                wall.fitted && (
                  <li className="note is-more">
                    <button
                      type="button"
                      className="note-paper"
                      onClick={() => captureRef.current?.focus()}
                    >
                      <span className="note-plus" aria-hidden="true">
                        ＋
                      </span>
                      <span className="note-caption">Collect more</span>
                    </button>
                  </li>
                )
              )}
            </ul>
          </section>

          <section
            className="year"
            style={{ '--cell': `${cell}px`, '--weeks': weekCount } as CSSProperties}
          >
            <header className="year-head">
              <h3 className="tile-title">{rangeLabel(weekCount)}</h3>
              <dl className="year-totals">
                <div>
                  <dd>{totals.added}</dd>
                  <dt>added</dt>
                </div>
                <div>
                  <dd>{totals.reviewed}</dd>
                  <dt>reviewed</dt>
                </div>
                <div>
                  <dd>{totals.drawn}</dd>
                  <dt>drawn</dt>
                </div>
              </dl>
              <p className="year-hint">Pick a day to plan a task.</p>
            </header>

            <div className="activity-body">
              <div className="activity-weekdays" aria-hidden="true">
                {WEEKDAYS.map((day, index) => (
                  <span key={index}>{day}</span>
                ))}
              </div>

              <div className="activity-months" aria-hidden="true">
                {monthLabels(weeks).map((label, index) => (
                  <span key={index}>{label}</span>
                ))}
              </div>

              <div className="activity-grid" ref={activityRef}>
                {days.map((date) => {
                  const key = dayKey(date)
                  const day = activity?.get(key)
                  const openTasks = openTasksByDate.get(key) ?? 0
                  const count = day ? day.drawn + day.reviewed + day.added : 0
                  const level = count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : 3
                  const classes = [
                    'activity-cell',
                    `level-${level}`,
                    key === todayKey && 'is-today',
                    openTasks > 0 && 'has-task',
                    selectedDate === key && 'is-selected',
                    date > new Date() && 'is-future',
                  ]
                    .filter(Boolean)
                    .join(' ')

                  const parts = [
                    day?.drawn && `${day.drawn} drawn`,
                    day?.reviewed && `${day.reviewed} reviewed`,
                    day?.added && `${day.added} added`,
                    openTasks > 0 && `${openTasks} ${openTasks === 1 ? 'task' : 'tasks'}`,
                  ].filter(Boolean)

                  return (
                    <button
                      key={key}
                      type="button"
                      className={classes}
                      aria-pressed={selectedDate === key}
                      title={`${key}${parts.length ? ` — ${parts.join(', ')}` : ''}`}
                      onClick={() => setSelectedDate(selectedDate === key ? null : key)}
                    >
                      <span className="visually-hidden">{key}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

          <TaskPanel
            tasks={tasks ?? []}
            selectedDate={selectedDate}
            onClearDate={() => setSelectedDate(null)}
            onChanged={reload}
          />
        </div>
      </div>
    </Page>
  )
}

/** A hand-drawn pink stroke under part of the headline. */
function Scribble({ children }: { children: ReactNode }) {
  return (
    <span className="scribble">
      {children}
      <svg viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true">
        <path d="M3 8.5 C 45 2.5, 95 11.5, 197 4.5" pathLength={1} />
      </svg>
    </span>
  )
}

function FeaturedTile({
  featured,
  now,
  onTry,
}: {
  featured: Featured | null
  now: number
  onTry: () => void
}) {
  if (!featured) {
    return (
      <section className="tile featured is-empty">
        <span className="featured-chip">Word of the Day</span>
        <p className="featured-invite">
          Once you mine a sentence, one of its words shows up here each day — marked where you found
          it.
        </p>
        <button type="button" className="btn" onClick={onTry}>
          Try an Example
        </button>
      </section>
    )
  }

  if (featured.kind === 'kanji') return <FeaturedKanji entry={featured.kanji} now={now} />

  const word = featured.word
  const sentence = word.sentence ?? ''

  return (
    <section className="tile featured">
      <header className="featured-head">
        <span className="featured-chip">Word of the Day</span>
        {/* Not the source: it is usually Japanese, and Japanese is never set at
            meta size (the 18px floor in tokens.css). */}
        <span className="featured-meta">{savedAgo(word.createdAt, now)}</span>
      </header>

      <div className="featured-body">
        <div className="featured-word jp" lang="ja">
          {word.reading && word.reading !== word.term ? (
            <ruby>
              {word.term}
              <rt>{word.reading}</rt>
            </ruby>
          ) : (
            word.term
          )}
        </div>
        <p className="featured-meaning">{word.meaning}</p>

        <p className="featured-sentence jp" lang="ja">
          <Highlighted sentence={sentence} term={word.term} />
        </p>
      </div>
    </section>
  )
}

/**
 * The kanji version of the tile, for a collection with no mined sentences yet.
 * The readings sit where the sentence would, in the same paper well, so the
 * tile keeps one shape whichever it shows.
 */
function FeaturedKanji({ entry, now }: { entry: RecentKanji; now: number }) {
  return (
    <section className="tile featured">
      <header className="featured-head">
        <span className="featured-chip">Kanji of the Day</span>
        <span className="featured-meta">
          {savedAgo(entry.addedAt, now).replace('saved', 'added')}
        </span>
      </header>

      <div className="featured-body">
        <Link to={`/kanji/${entry.literal}`} className="featured-word featured-glyph jp" lang="ja">
          {entry.literal}
        </Link>
        <p className="featured-meaning">{entry.meanings.slice(0, 3).join(', ')}</p>

        {(entry.onReadings.length > 0 || entry.kunReadings.length > 0) && (
          <dl className="featured-readings">
            {entry.onReadings.length > 0 && (
              <div>
                <dt>On</dt>
                <dd className="jp" lang="ja">
                  {entry.onReadings.slice(0, 3).join('・')}
                </dd>
              </div>
            )}
            {entry.kunReadings.length > 0 && (
              <div>
                <dt>Kun</dt>
                <dd className="jp" lang="ja">
                  {entry.kunReadings.slice(0, 3).join('・')}
                </dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </section>
  )
}

/**
 * What the app thinks you should do, computed server-side and never stored —
 * each count exists only while it is true. Words and kanji get a tile each; the
 * softer observations (never practised, keeps catching you out) ride along as
 * the kanji tile's detail line.
 */
function StatTiles({ suggestions }: { suggestions: Suggestion[] }) {
  const find = (kind: string) => suggestions.find((suggestion) => suggestion.kind === kind)
  const wordsDue = find('WORDS_DUE')?.count ?? 0
  const kanjiDue = find('DUE')?.count ?? 0
  const untouched = find('UNTOUCHED')?.count ?? 0
  const struggling = find('STRUGGLING')?.count ?? 0
  const empty = !!find('EMPTY')

  const kanjiDetail = empty
    ? 'Find one on the kanji page'
    : untouched > 0
      ? `${untouched} never practised`
      : struggling > 0
        ? `${struggling} ${struggling === 1 ? 'keeps' : 'keep'} catching you out`
        : kanjiDue > 0
          ? 'due now'
          : 'Nothing due — nice'

  return (
    <div className="stats">
      <Link to={wordsDue > 0 ? '/review' : '/collection'} className="stat stat-review">
        <span className="stat-ghost" aria-hidden="true">
          復
        </span>
        <span className="stat-label">Ready to Review</span>
        <span className="stat-number">{wordsDue}</span>
        <span className="stat-detail">
          {wordsDue > 0 ? (wordsDue === 1 ? 'word due now' : 'words due now') : 'All caught up'}
        </span>
        <span className="stat-go" aria-hidden="true">
          →
        </span>
      </Link>

      <Link to={empty ? '/kanji' : '/write'} className="stat stat-write">
        <span className="stat-ghost" aria-hidden="true">
          書
        </span>
        <span className="stat-label">{empty ? 'Add Your First Kanji' : 'Kanji to Write'}</span>
        <span className="stat-number">{empty ? '＋' : kanjiDue}</span>
        <span className="stat-detail">{kanjiDetail}</span>
        <span className="stat-go" aria-hidden="true">
          →
        </span>
      </Link>
    </div>
  )
}

function Note({ note, index }: { note: NoteItem; index: number }) {
  const style = {
    '--tilt': `${TILTS[index % TILTS.length]}deg`,
  } as CSSProperties
  const paper = stickyClass(index)

  if (note.kind === 'kanji') {
    return (
      <li className="note" style={style}>
        <Link
          to={`/kanji/${note.kanji.literal}`}
          className={`note-paper ${paper}`}
          title={note.kanji.meanings.slice(0, 3).join(', ')}
        >
          <span className="note-glyph jp" lang="ja">
            {note.kanji.literal}
          </span>
          <span className="sticky-caption">{note.kanji.meanings[0] ?? ''}</span>
        </Link>
      </li>
    )
  }

  return (
    <li className="note" style={style}>
      <div className={`note-paper ${paper}`} title={note.word.meaning}>
        <span className="note-term jp" lang="ja">
          {note.word.term}
        </span>
        <span className="sticky-caption">{note.word.meaning}</span>
      </div>
    </li>
  )
}
