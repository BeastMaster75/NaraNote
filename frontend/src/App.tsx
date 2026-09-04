import { Link, Route, Routes } from 'react-router'
import { NavRail } from './components/NavRail'
import { Page } from './components/Page'
import { KanjiLookup } from './kanji/KanjiLookup'
import { MiningPage } from './mining/MiningPage'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { PracticeSession } from './practice/PracticeSession'
import './App.css'

function NotFound() {
  return (
    <Page title="Not Found">
      <section className="card">
        <p className="muted">
          Nothing at this address. <Link to="/">Back to the start</Link>.
        </p>
      </section>
    </Page>
  )
}

function App() {
  return (
    <div className="app">
      <NavRail />

      <div className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/kanji" element={<KanjiLookup />} />
          <Route path="/kanji/:literal" element={<KanjiLookup />} />
          <Route path="/mine" element={<MiningPage />} />
          <Route path="/write" element={<PracticeSession />} />
          <Route path="/collection" element={<Library />} />
          <Route path="*" element={<NotFound />} />
        </Routes>

        <footer className="credits small muted">
          Kanji data from{' '}
          <a href="https://www.edrdg.org/wiki/index.php/KANJIDIC_Project">KANJIDIC2</a> (EDRDG,
          CC BY-SA 4.0). Stroke-order diagrams from{' '}
          <a href="https://kanjivg.tagaini.net/">KanjiVG</a> &copy; Ulrich Apel, CC BY-SA 3.0.
        </footer>
      </div>
    </div>
  )
}

export default App
