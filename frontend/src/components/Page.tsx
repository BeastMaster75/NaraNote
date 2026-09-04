import type { ReactNode } from 'react'
import './Page.css'

type PageProps = {
  /**
   * Omitted by pages that carry their own heading inside the content — the home
   * page puts the title inside its opening band rather than stranding it above
   * one, which would leave a line of text alone in the top-left corner.
   */
  title?: string
  subtitle?: string
  children: ReactNode
}

/**
 * Shared chrome for every screen: a title block, then whatever the page is.
 *
 * <p>There is no longer a narrow/wide distinction — every page fills the
 * available width, and readable line length is a property of the text inside
 * rather than of the page frame.
 */
export function Page({ title, subtitle, children }: PageProps) {
  return (
    <div className="page">
      {title && (
        <header className="page-head">
          <h2>{title}</h2>
          {subtitle && <p className="muted">{subtitle}</p>}
        </header>
      )}
      {children}
    </div>
  )
}
