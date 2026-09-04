import { NavLink, Link } from 'react-router'
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
  { to: '/write', label: 'Write', icon: 'M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z', built: true },
  // Two stacked cards — reviewing words, as distinct from writing characters.
  { to: '/review', label: 'Review', icon: 'M8 6h12v11H8z M4 4h11v2H6v11H4z', built: true },
  { to: '/collection', label: 'Collection', icon: 'M12 3 3 8l9 5 9-5z M3 14l9 5 9-5', built: true },
]

function toggleTheme() {
  const root = document.documentElement
  root.setAttribute(
    'data-theme',
    root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark',
  )
}

export function NavRail() {
  return (
    <nav className="rail" aria-label="Main">
      <Link to="/" className="rail-brand" aria-label="NaraNote home">
        <Logo size={44} />
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
              <svg
                width="21"
                height="21"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={item.icon} />
              </svg>
              <span className="rail-label">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="rail-toggle"
        onClick={toggleTheme}
        aria-label="Toggle light and dark theme"
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z" />
        </svg>
      </button>
    </nav>
  )
}
