import { useState } from 'react'
import { Link } from 'react-router'
import './TaskPanel.css'

export type Task = {
  id: number
  title: string
  dueDate: string | null
  kanji: string[]
  done: boolean
}

export type Suggestion = {
  kind: string
  title: string
  detail: string
  count: number
  action: string
}

type Filter = 'open' | 'done' | 'all'

type TaskPanelProps = {
  tasks: Task[]
  /** Set by clicking an activity day; filters the list and seeds the add form. */
  selectedDate: string | null
  onClearDate: () => void
  onChanged: () => void
}

/**
 * Tasks only. Suggestions used to head this panel, but they answer "what should I
 * do now?" — which belongs at the top of the page, not buried under a form.
 * The home page renders them; see RightNow there.
 */
export function TaskPanel({ tasks, selectedDate, onClearDate, onChanged }: TaskPanelProps) {
  const [filter, setFilter] = useState<Filter>('open')
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [kanjiText, setKanjiText] = useState('')
  const [busy, setBusy] = useState(false)

  const visible = tasks
    .filter((task) => (filter === 'all' ? true : filter === 'done' ? task.done : !task.done))
    .filter((task) => !selectedDate || task.dueDate === selectedDate)

  async function send(url: string, init: RequestInit) {
    setBusy(true)
    try {
      await fetch(url, init)
      onChanged()
    } finally {
      setBusy(false)
    }
  }

  async function add(event: React.FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    // Keep only CJK ideographs and radical forms — typing "待山" attaches both,
    // while stray punctuation or Latin can't become a link to a page that
    // cannot exist. Kana are excluded too: this field is for characters.
    const kanji = Array.from(kanjiText).filter((char) =>
      /[⺀-⿟㐀-䶿一-鿿]/.test(char),
    )
    await send('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        dueDate: date || selectedDate || null,
        kanji,
      }),
    })
    setTitle('')
    setDate('')
    setKanjiText('')
  }

  return (
    <aside className="panel">
      <section className="panel-block">
        <div className="panel-head">
          <h3 className="kicker">Your Tasks</h3>
          <div className="filters">
            {(['open', 'done', 'all'] as Filter[]).map((option) => (
              <button
                key={option}
                type="button"
                className={`filter${filter === option ? ' is-on' : ''}`}
                onClick={() => setFilter(option)}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        {selectedDate && (
          <div className="date-filter">
            <span>
              Showing <strong>{selectedDate}</strong>
            </span>
            <button type="button" className="link-button" onClick={onClearDate}>
              show all
            </button>
          </div>
        )}

        <form className="task-form" onSubmit={add}>
          <input
            className="task-input"
            placeholder="Add a task…"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
          />
          <div className="task-form-row">
            <input
              type="date"
              className="task-input task-date"
              value={date || selectedDate || ''}
              onChange={(event) => setDate(event.target.value)}
              aria-label="Due date"
            />
            <input
              className="task-input task-kanji-input jp-sm"
              placeholder="漢字"
              value={kanjiText}
              onChange={(event) => setKanjiText(event.target.value)}
              aria-label="Kanji this task is about"
            />
            <button type="submit" className="btn is-primary" disabled={busy || !title.trim()}>
              Add
            </button>
          </div>
        </form>

        {visible.length === 0 ? (
          <p className="muted small">
            {selectedDate
              ? `Nothing ${filter === 'all' ? '' : filter + ' '}on that day.`
              : `No ${filter === 'all' ? '' : filter + ' '}tasks.`}
          </p>
        ) : (
          <ul className="tasks">
            {visible.map((task) => (
              <li key={task.id} className={`task${task.done ? ' is-done' : ''}`}>
                <input
                  type="checkbox"
                  checked={task.done}
                  aria-label={`Mark "${task.title}" ${task.done ? 'not done' : 'done'}`}
                  onChange={() =>
                    send(`/api/tasks/${task.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ done: !task.done }),
                    })
                  }
                />
                <div className="task-body">
                  <span className="task-title">{task.title}</span>
                  <span className="task-meta">
                    {task.dueDate && <span className="task-date-chip">{task.dueDate}</span>}
                    {task.kanji.map((character) => (
                      <Link
                        key={character}
                        to={`/kanji/${character}`}
                        className="task-kanji jp-sm"
                      >
                        {character}
                      </Link>
                    ))}
                  </span>
                </div>
                <button
                  type="button"
                  className="task-delete"
                  aria-label={`Delete "${task.title}"`}
                  onClick={() => send(`/api/tasks/${task.id}`, { method: 'DELETE' })}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </aside>
  )
}
