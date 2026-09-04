import type { ReactNode } from 'react'
import './Page.css'

type PageProps = {
  title: string
  subtitle?: string
  children: ReactNode
}

/** Shared chrome for every screen: a title block, then whatever the page is. */
export function Page({ title, subtitle, children }: PageProps) {
  return (
    <div className="page">
      <header className="page-head">
        <h2>{title}</h2>
        {subtitle && <p className="muted">{subtitle}</p>}
      </header>
      {children}
    </div>
  )
}
