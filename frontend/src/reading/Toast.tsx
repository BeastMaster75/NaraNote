import { useEffect } from 'react'
import './Toast.css'

/**
 * A bottom-anchored, auto-dismissing message with an optional action —
 * specifically for actions taken with no confirmation step (a single fast
 * click), where an undo after the fact stands in for a confirm-before dialog.
 */
export function Toast({
  message,
  actionLabel,
  onAction,
  onDismiss,
  durationMs = 5000,
}: {
  message: string
  actionLabel?: string
  onAction?: () => void
  onDismiss: () => void
  durationMs?: number
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, durationMs)
    return () => clearTimeout(timer)
    // Deliberately re-arms whenever the message changes (a new toast replacing
    // an old one gets its own full duration), but not on every onDismiss
    // identity change, which would restart the timer on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message, durationMs])

  return (
    <div className="toast" role="status">
      <span>{message}</span>
      {actionLabel && onAction && (
        <button
          type="button"
          className="toast-action"
          onClick={() => {
            onAction()
            onDismiss()
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
