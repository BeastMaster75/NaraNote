import { NavLink } from 'react-router'
import { useUser, type Theme } from './UserContext'
import './TopBar.css'

const NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

const ICON: Record<Theme, string> = {
  // Half-filled circle, sun, moon — the state, not the action.
  system: 'M12 3a9 9 0 1 0 0 18z M12 3a9 9 0 1 1 0 18',
  light: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z M12 2v2 M12 20v2 M2 12h2 M20 12h2',
  dark: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
}

const LABEL: Record<Theme, string> = {
  system: 'Following your system',
  light: 'Light',
  dark: 'Dark',
}

/**
 * The user strip. Every page had a dead top-right corner and no way to reach
 * account settings; this fills the first with the second.
 */
export function TopBar() {
  const { me, save } = useUser()
  const initial = Array.from(me.displayName.trim())[0]?.toUpperCase() ?? '?'

  return (
    <header className="topbar">
      <div className="topbar-actions">
        <button
          type="button"
          className="topbar-btn"
          onClick={() => save({ theme: NEXT[me.theme] })}
          title={`Theme: ${LABEL[me.theme]}`}
          aria-label={`Theme: ${LABEL[me.theme]}. Switch to ${LABEL[NEXT[me.theme]]}.`}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={ICON[me.theme]} />
          </svg>
        </button>

        <NavLink
          to="/settings"
          className={({ isActive }) =>
            ['topbar-user', isActive && 'is-active'].filter(Boolean).join(' ')
          }
        >
          <span className="topbar-avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="topbar-name">{me.displayName}</span>
        </NavLink>
      </div>
    </header>
  )
}
