import { useEffect, useId, useRef, type ReactNode } from 'react'

type Props = {
  title: string
  // Extra class on the window, for example "contacts".
  className?: string
  onClose: () => void
  children: ReactNode
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

function focusableElements(dialog: HTMLElement | null): HTMLElement[] {
  return dialog
    ? Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (element) => !element.closest('[hidden], [aria-hidden="true"]'),
      )
    : []
}

function trapTab(event: KeyboardEvent, dialog: HTMLElement) {
  const elements = focusableElements(dialog)
  if (!elements.length) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const first = elements[0]
  const last = elements[elements.length - 1]
  const outside = !dialog.contains(document.activeElement)
  const leavesAtStart = event.shiftKey && document.activeElement === first
  const leavesAtEnd = !event.shiftKey && document.activeElement === last
  if (outside || leavesAtStart || leavesAtEnd) {
    event.preventDefault()
    ;(event.shiftKey ? last : first).focus()
  }
}

/** A dialog window over the page. It closes with the × at the top (as the Place panel,
 * SCRUM-76) and with a click outside the window. */
export default function Dialog({ title, className, onClose, children }: Props) {
  // A press that starts inside the window and ends outside (text selection) does not close it.
  const pressedOutside = useRef(false)
  const windowRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = windowRef.current
    const initialFocus = focusableElements(dialog)[0] ?? dialog
    initialFocus?.focus()

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab' || !dialog) return
      trapTab(event, dialog)
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener && document.contains(opener)) opener.focus()
    }
  }, [])

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
      <div
        ref={windowRef}
        className={className ? `dialog ${className}` : 'dialog'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="dialog-close" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
