import { Link, Outlet, Route, Routes } from 'react-router'
import { NavRail } from './components/NavRail'
import { Page } from './components/Page'
import { KanjiLookup } from './kanji/KanjiLookup'
import { KanjiSentences } from './kanji/KanjiSentences'
import { MiningPage } from './mining/MiningPage'
import { Home } from './pages/Home'
import { Library } from './pages/Library'
import { PracticeSession } from './practice/PracticeSession'
import { ReadingPage } from './reading/ReadingPage'
import { ReadingSession } from './reading/ReadingSession'
import { DeckWords } from './review/DeckWords'
import { ReviewHub } from './review/ReviewHub'
import { ReviewSession } from './review/ReviewSession'
import { ForgotPasswordPage } from './user/ForgotPasswordPage'
import { LoginPage } from './user/LoginPage'
import { RegisterPage } from './user/RegisterPage'
import { RequireAuth } from './user/RequireAuth'
import { RequireVerified } from './user/RequireVerified'
import { ResetPasswordPage } from './user/ResetPasswordPage'
import { SettingsPage } from './user/SettingsPage'
import { VerifyEmailPage } from './user/VerifyEmailPage'
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

/**
 * The nav rail is the chrome for the authenticated app — a layout route so
 * /login and /register (outside RequireAuth) don't render a nav rail full of
 * links that would just bounce back to /login. The account controls and the
 * data credits live in the rail too, so every pixel of height below it
 * belongs to the page.
 */
function AppShell() {
  return (
    <div className="app">
      <NavRail />

      <div className="app-main">
        <Outlet />
      </div>
    </div>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route element={<RequireAuth />}>
        {/* Outside RequireVerified on purpose — reaching it is the one thing an
            unverified account is allowed to do. */}
        <Route path="/verify-email" element={<VerifyEmailPage />} />

        <Route element={<RequireVerified />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<Home />} />
            <Route path="/kanji" element={<KanjiLookup />} />
            <Route path="/kanji/:literal" element={<KanjiLookup />} />
            <Route path="/mine" element={<MiningPage />} />
            <Route path="/read" element={<ReadingPage />} />
            <Route path="/read/session" element={<ReadingSession />} />
            <Route path="/write" element={<PracticeSession />} />
            <Route path="/review" element={<ReviewHub />} />
            <Route path="/review/session" element={<ReviewSession />} />
            <Route path="/review/deck" element={<DeckWords />} />
            <Route path="/collection" element={<Library />} />
            <Route path="/collection/:literal" element={<KanjiSentences />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Route>
    </Routes>
  )
}

export default App
