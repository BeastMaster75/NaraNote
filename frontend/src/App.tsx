import { Link, Route, Routes } from 'react-router'
import { Logo } from './components/Logo'
import { KanjiLookup } from './kanji/KanjiLookup'
import './App.css'

function toggleTheme() {
  const root = document.documentElement
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  root.setAttribute('data-theme', next)
}

function NotFound() {
  return (
    <section className="card">
      <h2 className="kicker">Not found</h2>
      <p className="muted">
        Nothing here. <Link to="/">Back to kanji lookup</Link>.
      </p>
    </section>
  )
}

function App() {
  return (
    <main className="shell">
      <header className="head">
        <Link to="/" className="head-brand" aria-label="NaraNote home">
          <Logo size={44} />
        </Link>
        <div className="head-text">
          <h1>NaraNote</h1>
          <p className="muted">Japanese study companion</p>
        </div>
        <button type="button" className="btn" onClick={toggleTheme}>
          Theme
        </button>
      </header>

      <Routes>
        <Route path="/" element={<KanjiLookup />} />
        <Route path="/kanji/:literal" element={<KanjiLookup />} />
        <Route path="*" element={<NotFound />} />
      </Routes>

      <footer className="credits small muted">
        Kanji data from{' '}
        <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project">KANJIDIC2</a> (EDRDG,
        CC BY-SA 4.0). Stroke-order diagrams from{' '}
        <a href="https://kanjivg.tagaini.net/">KanjiVG</a> &copy; Ulrich Apel, CC BY-SA 3.0.
      </footer>
    </main>
  )
}

export default App
