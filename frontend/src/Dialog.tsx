import { useRef, type ReactNode } from 'react'

type Props = {
  title: string
  // Extra class on the window, for example "contacts".
  className?: string
  onClose: () => void
  children: ReactNode
}

/** A dialog window over the page. It closes with the × at the top (as the Place panel,
 * SCRUM-76) and with a click outside the window. */
export default function Dialog({ title, className, onClose, children }: Props) {
  // A press that starts inside the window and ends outside (text selection) does not close it.
  const pressedOutside = useRef(false)

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (pressedOutside.current && event.target === event.currentTarget) onClose()
        pressedOutside.current = false
      }}
    >
      <div className={className ? `dialog ${className}` : 'dialog'} role="dialog" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button type="button" className="dialog-close" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
