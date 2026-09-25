import type { ReactNode } from 'react'
import './Page.css'

type PageProps = {
  /**
   * Omitted by pages that carry their own heading inside the content — the home
   * page puts the title inside its opening band rather than stranding it above
   * one, which would leave a line of text alone in the top-left corner.
   */
  title?: string
  /** A few words beside the title, not a sentence under it. */
  subtitle?: string
  /** Controls that belong to the whole page, set at the right of the title row. */
  actions?: ReactNode
  children: ReactNode
}

/**
 * Shared chrome for every screen: one title row, then whatever the page is.
 *
 * <p>The title, its subtitle and any page-level controls share a single row.
 * Stacked, they cost ~110px on every page before any content — the largest
 * single reason pages scrolled on a laptop-height screen.
 */
export function Page({ title, subtitle, actions, children }: PageProps) {
  return (
    <div className="page">
      {title && (
        <header className="page-head">
          <h2>{title}</h2>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
          {actions && <div className="page-actions">{actions}</div>}
        </header>
      )}
      {children}
    </div>
  )
}
