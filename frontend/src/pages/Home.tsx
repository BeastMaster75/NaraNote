import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Page } from '../components/Page'
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

/**
 * Half a year of small cells rather than one month of large ones. The month grid
 * this replaces was five rows of 112px cells that were empty most days — the
 * single biggest patch of dead space on the page — and it showed less.
 */
const WEEKS = 26
const WEEKDAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']

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
function stripWeeks() {
  const today = new Date()
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // getDay() is Sunday-first; shift to a Monday-first index, then run on to that
  // week's Sunday. Six minus the index, not seven — seven lands on the Monday
  // after, which slides every row one place off its weekday label.
  end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7)))

  const weeks: Date[][] = []
  for (let week = WEEKS - 1; week >= 0; week -= 1) {
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

  const weeks = stripWeeks()
  const days = weeks.flat()

  // The strip spans seven or so calendar months and /api/activity is per-month,
  // so fetch each month it touches and merge them into one lookup.
  useEffect(() => {
    const months = [...new Set(days.map(monthKey))]
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
    // days is derived from the clock, not from state — recomputing it every
    // render would refetch forever, so this deliberately runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      // More than fits, deliberately — CSS clips to three rows rather than the
      // count being tuned to exactly one card height.
      .then((all) => setWords(all.slice(0, 10)))
      .catch(() => undefined)
    fetch('/api/library')
      .then((response) => (response.ok ? (response.json() as Promise<RecentKanji[]>) : []))
      // More than fits at most window sizes, deliberately — CSS clips to three
      // rows rather than the count being tuned to exactly one size.
      .then((all) => setKanji(all.slice(0, 27)))
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
            <header className="hero-head">
              <h2>NaraNote</h2>
              <p className="muted">Collect the Japanese You Meet</p>
            </header>

            <textarea
              className="hero-textarea jp"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="日本語をここに貼り付けてください"
              rows={5}
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

        {/* One row, not two bands: three bands stacked put home at 1376px and
            made it the only page that scrolled. Rendered unconditionally so the
            column count doesn't change under a fresh account — the empty states
            say what to do instead. */}
        <div className="home-lower">
          <section className="recent">
            <div className="recent-block recent-block-kanji">
              <h3 className="kicker">Kanji You Added</h3>
              <ul className="recent-kanji">
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
            </div>

            <div className="recent-block">
              <h3 className="kicker">Words You Saved</h3>
              <ul className="recent-words">
                {words.slice(0, 3).map((word) => (
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
            </div>
          </section>

          <section className="activity">
            <header className="activity-head">
              <h3 className="kicker">Last Six Months</h3>
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
            </header>

            <div className="activity-body">
              <div className="activity-weekdays" aria-hidden="true">
                {WEEKDAYS.map((day, index) => (
                  <span key={index}>{day}</span>
                ))}
              </div>

              <div className="activity-months" aria-hidden="true">
                {weeks.map((week, index) => {
                  // Label a column only where its week starts a new month, which
                  // is what makes the strip readable without a cell per date.
                  const isNew =
                    index === 0 || week[0].getMonth() !== weeks[index - 1][0].getMonth()
                  return (
                    <span key={index}>
                      {isNew ? week[0].toLocaleString(undefined, { month: 'short' }) : ''}
                    </span>
                  )
                })}
              </div>

              <div className="activity-grid">
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

            <p className="muted small">
              Activity is logged automatically from what you complete. Click a day to
              schedule a task.
            </p>
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
          <p className="muted small">
            Nothing is due. Everything you have saved is scheduled further out.
          </p>
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

      <p className="rightnow-note small">
        These update automatically rather than being marked complete — each one disappears
        once it no longer applies.
      </p>
    </aside>
  )
}
