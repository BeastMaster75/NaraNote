import { Link } from 'react-router'
import { Page } from '../components/Page'

type PlaceholderProps = {
  title: string
  /** What this section will do, so the page is a roadmap rather than a dead end. */
  blurb: string
}

export function Placeholder({ title, blurb }: PlaceholderProps) {
  return (
    <Page title={title}>
      <section className="card">
        <h3 className="kicker">Not Built Yet</h3>
        <p className="muted">{blurb}</p>
        <p className="muted small">
          In the meantime, <Link to="/kanji">kanji lookup</Link> works.
        </p>
      </section>
    </Page>
  )
}
