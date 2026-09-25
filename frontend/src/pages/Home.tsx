import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '../components/Page'
import { useFitTiles } from '../components/useFitTiles'
import { TaskPanel, type Suggestion, type Task } from '../tasks/TaskPanel'
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
}

type RecentKanji = {
  literal: string
  meanings: string[]
}

const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

/** Gap between activity cells, in px. Mirrors Home.css. */
const CELL_GAP = 4
/** Never less than a quarter of a year, never more than a whole one. */
const MIN_WEEKS = 13
const MAX_WEEKS = 53

/**
 * Cell size follows the screen's height — 14px on a 720px laptop, 21px on 1080p
 * — so the band stays a band and never crowds out the row below it.
 */
function cellFor(viewportHeight: number) {
  return Math.max(11, Math.min(26, Math.floor(viewportHeight / 50)))
}

type ActivityLayout = { weeks: number; cell: number }

/**
 * As many weeks as the strip's width holds at the current cell size. The strip
 * used to be a fixed 26 weeks of cells capped at 40px, sitting in a card
 * stretched to the row's height — a short heatmap floating in a tall, mostly
 * empty box. Across the full width it is the shape a heatmap wants to be, and a
 * wide screen simply shows more of the year instead of bigger squares.
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

/**
 * Kanji tiles grow to fill their card when there are few of them. At a fixed
 * 3.2rem, 23 kanji filled three rows and left the rest of the card blank; a new
 * collection now reads as a handful of big characters, and shrinks back toward
 * the small tiles (3.2rem) as it grows.
 */
const KANJI_TILES = { min: 51, max: 104, gap: 8 } // gap mirrors .recent-kanji

/** "Last Year", or "Last 7 Months" for however many weeks are showing. */
function rangeLabel(weeks: number) {
  if (weeks >= 50) return 'Last Year'
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

export function Home() {
  const navigate = useNavigate()
  const [activity, setActivity] = useState<Map<string, ActivityDay>>(new Map())
  const [tasks, setTasks] = useState<Task[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [words, setWords] = useState<RecentWord[]>([])
  const [kanji, setKanji] = useState<RecentKanji[]>([])
  const [text, setText] = useState('')
  const [source, setSource] = useState('')

  const [activityRef, { weeks: weekCount, cell }] = useActivityLayout()
  const weeks = stripWeeks(weekCount)
  const days = weeks.flat()
  const [kanjiRef, { size: tile, rows: tileRows }] = useFitTiles(kanji.length, KANJI_TILES)

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
      .then(setTasks)
      .catch(() => undefined)
    fetch('/api/tasks/suggestions')
      .then((response) => (response.ok ? (response.json() as Promise<Suggestion[]>) : []))
      .then(setSuggestions)
      .catch(() => undefined)
  }, [])

  useEffect(reload, [reload])

  useEffect(() => {
    fetch('/api/vocab')
      .then((response) => (response.ok ? (response.json() as Promise<RecentWord[]>) : []))
      // More than fits, deliberately — CSS shows whole rows up to the card's
      // height rather than the count being tuned to one window size.
      .then((all) => setWords(all.slice(0, 24)))
      .catch(() => undefined)
    fetch('/api/library')
      .then((response) => (response.ok ? (response.json() as Promise<RecentKanji[]>) : []))
      // More than fits at most window sizes, deliberately — CSS shows whole rows
      // up to the card's height rather than the count being tuned to one size.
      .then((all) => setKanji(all.slice(0, 60)))
      .catch(() => undefined)
  }, [])

  const todayKey = dayKey(new Date())

  const totals = [...activity.values()].reduce(
    (sum, day) => ({
      drawn: sum.drawn + day.drawn,
      reviewed: sum.reviewed + day.reviewed,
      added: sum.added + day.added,
    }),
    { drawn: 0, reviewed: 0, added: 0 },
  )

  const openTasksByDate = new Map<string, number>()
  for (const task of tasks) {
    if (!task.dueDate || task.done) continue
    openTasksByDate.set(task.dueDate, (openTasksByDate.get(task.dueDate) ?? 0) + 1)
  }

  function mine(input: string) {
    if (!input.trim()) return
    // Router state rather than a query string: a mined passage is a paragraph,
    // and paragraphs of Japanese make for a hostile URL.
    navigate('/mine', { state: { text: input, source: source.trim() || null } })
  }

  return (
    <Page>
      <div className="home">
        <section className="hero">
          <div className="hero-capture">
            {/* Not "NaraNote": the logo sits a few pixels away in the rail, and a
                page that names itself says nothing. This says what the box is for. */}
            <header className="hero-head">
              <h2>What Did You Read Today?</h2>
              <p className="muted small">Paste it and keep the words you didn&rsquo;t know.</p>
            </header>

            <textarea
              className="hero-textarea jp"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="日本語をここに貼り付けてください"
              rows={2}
              aria-label="Japanese text to mine"
            />

            <div className="hero-actions">
              <input
                className="hero-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                placeholder="Where it's from (optional)"
                aria-label="Source"
              />
              <button
                type="button"
                className="btn is-primary"
                onClick={() => mine(text)}
                disabled={!text.trim()}
              >
                Mine It
              </button>
              <button type="button" className="btn" onClick={() => mine(SAMPLE)}>
                Try an Example
              </button>
            </div>
          </div>

          <RightNow suggestions={suggestions} />
        </section>

        {/* The record is a wide, short band across the page — the shape a heatmap
            wants — and the three things that are lists or grids share the rest
            of the height below it, each able to fill whatever it gets. As a tall
            column the heatmap left most of its card empty. Rendered
            unconditionally so the layout doesn't change under a fresh account —
            the empty states say what to do instead. */}
        <section
          className="activity"
          style={{ '--cell': `${cell}px`, '--weeks': weekCount } as CSSProperties}
        >
          {/* A column beside the grid rather than a row above it: the band is
              then only as tall as seven cells. */}
          <header className="activity-head">
            <h3 className="kicker">{rangeLabel(weekCount)}</h3>
            <dl className="activity-totals">
              <div>
                <dt>Drawn</dt>
                <dd>{totals.drawn}</dd>
              </div>
              <div>
                <dt>Reviewed</dt>
                <dd>{totals.reviewed}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{totals.added}</dd>
              </div>
            </dl>
            <p className="activity-hint small">Click a day to plan a task.</p>
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
                const day = activity.get(key)
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

        <div className="home-lower">
          <section className="recent-block recent-block-kanji">
            <h3 className="kicker">Kanji You Added</h3>
            <ul
              className="recent-kanji"
              ref={kanjiRef}
              style={{ '--tile': `${tile}px`, '--rows': tileRows } as CSSProperties}
            >
              {kanji.map((entry) => (
                <li key={entry.literal}>
                  <Link
                    to={`/kanji/${entry.literal}`}
                    className="recent-glyph"
                    title={entry.meanings.slice(0, 3).join(', ')}
                  >
                    {entry.literal}
                  </Link>
                </li>
              ))}
              {kanji.length === 0 && (
                <li className="muted small">
                  None yet — find one on the <Link to="/kanji">kanji page</Link>.
                </li>
              )}
            </ul>
          </section>

          <section className="recent-block">
            <h3 className="kicker">Words You Saved</h3>
            <ul className="recent-words">
              {words.map((word) => (
                <li key={word.id} className="recent-word">
                  <span className="recent-term jp-sm">{word.term}</span>
                  <span className="recent-meaning">{word.meaning}</span>
                </li>
              ))}
              {words.length === 0 && (
                <li className="muted small">
                  None yet — paste something above and save what you don&rsquo;t know.
                </li>
              )}
            </ul>
          </section>

          <TaskPanel
            tasks={tasks}
            selectedDate={selectedDate}
            onClearDate={() => setSelectedDate(null)}
            onChanged={reload}
          />
        </div>
      </div>
    </Page>
  )
}

/**
 * What the app thinks you should do, computed server-side and never stored.
 * Nothing here can be ticked off — each entry exists only while it is true.
 */
function RightNow({ suggestions }: { suggestions: Suggestion[] }) {
  return (
    <aside className="rightnow">
      <h3 className="kicker">Right Now</h3>

      {suggestions.length === 0 ? (
        <div className="rightnow-clear">
          <p className="muted small">Nothing due. You&rsquo;re all caught up.</p>
          <Link to="/collection" className="btn">
            See Collection
          </Link>
        </div>
      ) : (
        <ul className="rightnow-list">
          {suggestions.map((suggestion) => (
            <li key={suggestion.kind}>
              <Link
                to={suggestion.action}
                className={`rightnow-tile s-${suggestion.kind.toLowerCase()}`}
              >
                {suggestion.count > 0 && (
                  <span className="rightnow-count">{suggestion.count}</span>
                )}
                <span className="rightnow-text">
                  <span className="rightnow-title">{suggestion.title}</span>
                  <span className="rightnow-detail">{suggestion.detail}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

    </aside>
  )
}
