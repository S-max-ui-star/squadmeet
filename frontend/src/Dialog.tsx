import { useEffect, useId, useRef, type FormEventHandler, type ReactNode, type RefObject } from 'react'

type Props = {
  title: string
  // Extra class on the window, for example "contacts".
  className?: string
  onClose?: () => void
  dismissible?: boolean
  onSubmit?: FormEventHandler<HTMLFormElement>
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

/** On a phone the dialog is a sheet at the bottom (SCRUM-168). The virtual keyboard covers the
 * bottom of the screen without making the page smaller, so the backdrop gets the covered height
 * as `--keyboard-inset` (CSS), and the focused input scrolls back into view. */
function useKeyboardInset(
  backdropRef: RefObject<HTMLDivElement | null>,
  windowRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    const viewport = window.visualViewport
    const backdrop = backdropRef.current
    if (!viewport || !backdrop) return

    function update() {
      const covered = Math.max(0, Math.round(window.innerHeight - viewport!.height - viewport!.offsetTop))
      backdrop!.style.setProperty('--keyboard-inset', `${covered}px`)
      const focused = document.activeElement
      if (covered && focused instanceof HTMLElement && windowRef.current?.contains(focused)) {
        focused.scrollIntoView?.({ block: 'nearest' })
      }
    }

    update()
    viewport.addEventListener('resize', update)
    return () => viewport.removeEventListener('resize', update)
  }, [backdropRef, windowRef])
}

/** A dialog window over the page. It closes with the × at the top (as the Place panel,
 * SCRUM-76) and with a click outside the window. */
export default function Dialog({
  title,
  className,
  onClose,
  dismissible = true,
  onSubmit,
  children,
}: Props) {
  // A press that starts inside the window and ends outside (text selection) does not close it.
  const pressedOutside = useRef(false)
  const windowRef = useRef<HTMLElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const onCloseRef = useRef(onClose)
  const dismissibleRef = useRef(dismissible)
  const titleId = useId()
  useKeyboardInset(backdropRef, windowRef)

  useEffect(() => {
    onCloseRef.current = onClose
    dismissibleRef.current = dismissible
  }, [dismissible, onClose])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialog = windowRef.current
    if (!dialog?.contains(document.activeElement)) {
      const initialFocus = focusableElements(dialog)[0] ?? dialog
      initialFocus?.focus()
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && dismissibleRef.current && onCloseRef.current) {
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

  const content = (
    <>
      <div className="dialog-head">
        <h2 id={titleId}>{title}</h2>
        {onClose && (
          <button
            type="button"
            className="dialog-close"
            aria-label="Schließen"
            disabled={!dismissible}
            onClick={onClose}
          >
            ×
          </button>
        )}
      </div>
      {children}
    </>
  )

  const windowProps = {
    className: className ? `dialog ${className}` : 'dialog',
    role: 'dialog',
    'aria-modal': true,
    'aria-labelledby': titleId,
    tabIndex: -1,
  } as const

  return (
    <div
      ref={backdropRef}
      className="dialog-backdrop"
      onMouseDown={(event) => {
        pressedOutside.current = event.target === event.currentTarget
      }}
      onClick={(event) => {
        if (
          pressedOutside.current &&
          event.target === event.currentTarget &&
          dismissible &&
          onClose
        ) {
          onClose()
        }
        pressedOutside.current = false
      }}
    >
      {onSubmit ? (
        <form
          ref={(element) => {
            windowRef.current = element
          }}
          {...windowProps}
          onSubmit={onSubmit}
        >
          {content}
        </form>
      ) : (
        <div
          ref={(element) => {
            windowRef.current = element
          }}
          {...windowProps}
        >
          {content}
        </div>
      )}
    </div>
  )
}
