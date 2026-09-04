import { useCallback, useEffect, useState } from 'react'
import { Page } from '../components/Page'
import { TaskPanel, type Suggestion, type Task } from '../tasks/TaskPanel'
import './Home.css'

type ActivityDay = {
  date: string
  drawn: number
  reviewed: number
  added: number
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function dayKey(date: Date) {
  return `${monthKey(date)}-${String(date.getDate()).padStart(2, '0')}`
}

export function Home() {
  const [month, setMonth] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [activity, setActivity] = useState<Map<string, ActivityDay>>(new Map())
  const [tasks, setTasks] = useState<Task[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/activity?month=${monthKey(month)}`)
      .then((response) => (response.ok ? (response.json() as Promise<ActivityDay[]>) : []))
      .then((days) => !cancelled && setActivity(new Map(days.map((d) => [d.date, d]))))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [month])

  // Tasks and suggestions are refetched together: completing a task can change
  // nothing about suggestions, but practising from one changes both.
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

  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  // getDay() is Sunday-first; shift so the grid starts on Monday.
  const leadingBlanks = (first.getDay() + 6) % 7
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

  // Note: the "practise N due" prompt lives only in the task panel. It used to be
  // duplicated as a calendar CTA, which read as padding.
  return (
    <Page title="NaraNote" subtitle="Collect the Japanese You Meet">
      <div className="home">
        <section className="calendar">
          <header className="calendar-head">
            <h3 className="calendar-month">
              {month.toLocaleString(undefined, { month: 'long' })}{' '}
              <span className="calendar-year">{month.getFullYear()}</span>
            </h3>

            <div className="calendar-nav">
              <button
                type="button"
                className="btn"
                aria-label="Previous month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                ‹
              </button>
              <button
                type="button"
                className="btn"
                aria-label="Next month"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                ›
              </button>
            </div>

            <dl className="calendar-totals">
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

          <div className="calendar-grid">
            {WEEKDAYS.map((day) => (
              <div key={day} className="calendar-weekday">
                {day}
              </div>
            ))}

            {Array.from({ length: leadingBlanks }, (_, i) => (
              <div key={`blank-${i}`} className="calendar-cell is-blank" />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const dayNumber = i + 1
              const key = `${monthKey(month)}-${String(dayNumber).padStart(2, '0')}`
              const day = activity.get(key)
              const openTasks = openTasksByDate.get(key) ?? 0
              const classes = [
                'calendar-cell',
                key === todayKey && 'is-today',
                (day || openTasks) && 'has-activity',
                selectedDate === key && 'is-selected',
              ]
                .filter(Boolean)
                .join(' ')

              return (
                <button
                  key={key}
                  type="button"
                  className={classes}
                  aria-pressed={selectedDate === key}
                  onClick={() => setSelectedDate(selectedDate === key ? null : key)}
                >
                  <span className="calendar-daynum">{dayNumber}</span>
                  {key === todayKey && <span className="calendar-today">today</span>}
                  {openTasks > 0 && (
                    <span className="chip-task">
                      {openTasks} {openTasks === 1 ? 'task' : 'tasks'}
                    </span>
                  )}
                  {day && day.drawn > 0 && <span className="chip-drawn">{day.drawn} drawn</span>}
                  {day && day.reviewed > 0 && (
                    <span className="chip-reviewed">{day.reviewed} reviewed</span>
                  )}
                  {day && day.added > 0 && <span className="chip-added">{day.added} added</span>}
                </button>
              )
            })}
          </div>

          <p className="muted small calendar-note">
            Activity fills itself in from what you did. Click a day to plan it.
          </p>
        </section>

        <TaskPanel
          tasks={tasks}
          suggestions={suggestions}
          selectedDate={selectedDate}
          onClearDate={() => setSelectedDate(null)}
          onChanged={reload}
        />
      </div>
    </Page>
  )
}
