import { NavLink, Link, useNavigate } from 'react-router'
import { useUser, type Theme } from '../user/UserContext'
import { Logo } from './Logo'
import './NavRail.css'

type NavItem = {
  to: string
  label: string
  /** Path data for a 24x24 icon, drawn at stroke-width 2.75 per the design system. */
  icon: string
  built: boolean
}

const ITEMS: NavItem[] = [
  { to: '/', label: 'Home', icon: 'M3 10.5 12 3l9 7.5V21H3z M9 21v-6h6v6', built: true },
  // A 原稿用紙 writing cell — the grid you practise characters inside.
  { to: '/kanji', label: 'Kanji', icon: 'M4 4h16v16H4z M12 4v16 M4 12h16', built: true },
  { to: '/mine', label: 'Mine', icon: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4.6-4.6', built: true },
  // An open book — two facing pages on a shared spine.
  {
    to: '/read',
    label: 'Read',
    icon: 'M3 5.5c3-1.3 6-1.3 9 0 3-1.3 6-1.3 9 0v13c-3-1.3-6-1.3-9 0-3-1.3-6-1.3-9 0z M12 5.5v13',
    built: true,
  },
  { to: '/write', label: 'Write', icon: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z', built: true },
  // Two stacked cards — reviewing words, as distinct from writing characters.
  { to: '/review', label: 'Review', icon: 'M8 6h12v11H8z M4 4h11v2H6v11H4z', built: true },
  { to: '/collection', label: 'Collection', icon: 'M12 3 3 8l9 5 9-5z M3 14l9 5 9-5', built: true },
]

const NEXT_THEME: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }

const THEME_ICON: Record<Theme, string> = {
  // Half-filled circle, sun, moon — the state, not the action.
  system: 'M12 3a9 9 0 1 0 0 18z M12 3a9 9 0 1 1 0 18',
  light: 'M12 7.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9z M12 2v2 M12 20v2 M2 12h2 M20 12h2',
  dark: 'M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z',
}

const THEME_LABEL: Record<Theme, string> = {
  system: 'Following your system',
  light: 'Light',
  dark: 'Dark',
}

function Icon({ d, size = 21 }: { d: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}

/**
 * The app's one piece of chrome. Navigation at the top; the account — avatar
 * to settings, theme, log out — and the data credits at the foot.
 *
 * <p>The account used to live in a top bar of its own: a full-width strip on
 * every page holding three small controls, which cost ~55px of height on a
 * product whose rule is that no page scrolls. The rail had the room already.
 */
export function NavRail() {
  const { me, save, logout } = useUser()
  const navigate = useNavigate()
  const initial = Array.from(me.displayName.trim())[0]?.toUpperCase() ?? '?'

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <nav className="rail" aria-label="Main">
      <Link to="/" className="rail-brand" aria-label="NaraNote home">
        <Logo size={56} />
      </Link>

      <ul className="rail-items">
        {ITEMS.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                ['rail-item', isActive && 'is-active', !item.built && 'is-unbuilt']
                  .filter(Boolean)
                  .join(' ')
              }
            >
              <Icon d={item.icon} />
              <span className="rail-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="rail-account">
        <button
          type="button"
          className="rail-small"
          onClick={() => save({ theme: NEXT_THEME[me.theme] })}
          title={`Theme: ${THEME_LABEL[me.theme]}`}
          aria-label={`Theme: ${THEME_LABEL[me.theme]}. Switch to ${THEME_LABEL[NEXT_THEME[me.theme]]}.`}
        >
          <Icon d={THEME_ICON[me.theme]} size={17} />
        </button>
        <button
          type="button"
          className="rail-small"
          onClick={handleLogout}
          title="Log out"
          aria-label="Log out"
        >
          <Icon d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9" size={17} />
        </button>
        <NavLink
          to="/settings"
          className={({ isActive }) => ['rail-avatar', isActive && 'is-active'].filter(Boolean).join(' ')}
          title={`${me.displayName} — Settings`}
          aria-label={`Settings for ${me.displayName}`}
        >
          {initial}
        </NavLink>

        {/* Attribution is a licence condition for KANJIDIC2, KanjiVG and JMdict, so
            a link to it sits in the chrome of every page; the full text lives
            once on Settings. */}
        <Link to="/settings#credits" className="rail-credits">
          Credits
        </Link>
      </div>
    </nav>
  )
}
