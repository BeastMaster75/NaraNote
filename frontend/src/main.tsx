import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './index.css'
import App from './App.tsx'
import { UserProvider } from './user/UserContext'

// Dark mode is attribute-driven — the CSS carries one definition of the dark
// palette rather than a duplicate inside a media query.
//
// This is a one-shot guess so the first paint isn't the wrong colour while
// /api/me is in flight. It deliberately registers no listener: UserProvider owns
// the attribute from mount onwards, and two owners would fight over it.
document.documentElement.setAttribute(
  'data-theme',
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <UserProvider>
        <App />
      </UserProvider>
    </BrowserRouter>
  </StrictMode>,
)
