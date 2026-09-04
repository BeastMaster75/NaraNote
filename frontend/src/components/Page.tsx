import type { ReactNode } from 'react'
import './Page.css'

type PageProps = {
  title: string
  subtitle?: string
  /** Opt out of the reading-width cap, for screens with a side panel. */
  wide?: boolean
  children: ReactNode
}

/** Shared chrome for every screen: a title block, then whatever the page is. */
export function Page({ title, subtitle, wide, children }: PageProps) {
  return (
    <div className={`page${wide ? ' is-wide' : ''}`}>
      <header className="page-head">
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </header>
      {children}
    </div>
  )
}
