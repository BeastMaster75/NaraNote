import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Dark mode is attribute-driven — the CSS carries one definition of the dark
// palette rather than a duplicate inside a media query. Follow the OS until
// there's an explicit in-app preference to respect.
const prefersDark = window.matchMedia('(prefers-color-scheme: dark)')

function applyTheme(isDark: boolean) {
  document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light')
}

applyTheme(prefersDark.matches)
prefersDark.addEventListener('change', (event) => applyTheme(event.matches))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
