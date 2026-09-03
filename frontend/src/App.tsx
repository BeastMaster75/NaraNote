import { Logo } from './components/Logo'
import { KanjiLookup } from './kanji/KanjiLookup'
import './App.css'

function toggleTheme() {
  const root = document.documentElement
  const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'
  root.setAttribute('data-theme', next)
}

function App() {
  return (
    <main className="shell">
      <header className="head">
        <Logo size={44} />
        <div className="head-text">
          <h1>NaraNote</h1>
          <p className="muted">Japanese study companion</p>
        </div>
        <button type="button" className="btn" onClick={toggleTheme}>
          Theme
        </button>
      </header>

      <KanjiLookup />

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
