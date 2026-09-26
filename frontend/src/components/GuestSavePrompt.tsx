import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useUser } from '../user/UserContext'
import './GuestSavePrompt.css'

/** Collection sizes worth pausing at: each is more to lose than the last. */
const MOMENTS = [10, 30, 100]
const DISMISSED_KEY = 'naranote.savePromptDismissed'

function dismissedUpTo(): number {
  try {
    return Number(localStorage.getItem(DISMISSED_KEY)) || 0
  } catch {
    return 0
  }
}

/**
 * The honest reason for a guest to make an account, asked at the moments it's true: a
 * collection that's grown to 10, 30, 100 kanji lives only in this browser. Once per moment —
 * "Not Now" holds until the next one — and never a modal: the same reasoning that cut the
 * streak counter, a study app that nags is one people quit. A quiet line in the nav rail
 * covers every other time.
 *
 * <p>Floats in a corner rather than taking a row of the page, so it can't make a page scroll.
 */
export function GuestSavePrompt() {
  const { me, status } = useUser()
  const location = useLocation()
  const [moment, setMoment] = useState<number | null>(null)
  const [count, setCount] = useState(0)

  const eligible = status === 'authenticated' && me.guest && !me.pendingEmail

  useEffect(() => {
    if (!eligible) return
    let live = true
    // Re-checked on navigation: collecting happens on other pages, and moving on from one
    // is a natural pause to ask in — never in the middle of a tap.
    fetch('/api/library')
      .then((response) => (response.ok ? (response.json() as Promise<unknown[]>) : []))
      .then((entries) => {
        if (!live) return
        const reached = MOMENTS.filter((size) => entries.length >= size).at(-1) ?? null
        setCount(entries.length)
        setMoment(reached !== null && reached > dismissedUpTo() ? reached : null)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [eligible, location.pathname])

  if (!eligible || moment === null || location.pathname === '/settings') return null

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, String(moment))
    } catch {
      // Storage blocked: it'll ask again next visit, which is survivable.
    }
    setMoment(null)
  }

  return (
    <aside className="save-prompt" aria-label="Save your collection">
      <p className="save-prompt-title">You’ve collected {count} kanji.</p>
      <p className="save-prompt-body">They only live in this browser. Save them to an account to keep them safe and use them anywhere.</p>
      <div className="save-prompt-actions">
        <Link to="/settings#save" className="btn is-primary" onClick={dismiss}>
          Save Them
        </Link>
        <button type="button" className="btn" onClick={dismiss}>
          Not Now
        </button>
      </div>
    </aside>
  )
}
