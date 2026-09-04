import { Link } from 'react-router'
import { Page } from '../components/Page'
import './Home.css'

type Section = {
  to: string
  title: string
  body: string
  ready: boolean
}

// This list is the honest state of the app. As a section lands, flip `ready`.
const SECTIONS: Section[] = [
  {
    to: '/kanji',
    title: 'Kanji',
    body: 'Look up any character for its readings, meanings and stroke order.',
    ready: true,
  },
  {
    to: '/mine',
    title: 'Mine',
    body: 'Paste Japanese you have read and pull the words you do not know out of it.',
    ready: false,
  },
  {
    to: '/write',
    title: 'Write',
    body: 'Draw a kanji by hand, then check your stroke order against the real thing.',
    ready: true,
  },
  {
    to: '/collection',
    title: 'Collection',
    body: 'The kanji you have chosen to study, ready to practise and eventually export.',
    ready: true,
  },
]

export function Home() {
  return (
    <Page title="NaraNote" subtitle="Your Japanese learning companion">
      <div className="home-grid">
        {SECTIONS.map((section) => (
          <Link
            key={section.to}
            to={section.to}
            className={`home-card${section.ready ? '' : ' is-unbuilt'}`}
          >
            <div className="home-card-head">
              <h3>{section.title}</h3>
              {!section.ready && <span className="home-badge">Soon</span>}
            </div>
            <p className="home-card-body">{section.body}</p>
          </Link>
        ))}
      </div>
    </Page>
  )
}
