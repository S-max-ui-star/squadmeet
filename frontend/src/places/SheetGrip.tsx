import { useRef, type KeyboardEvent, type PointerEvent, type RefObject } from 'react'
import { nearestSnap, nextSnap, SNAP_LABEL, stepSnap, type Snap } from './sheetSnap'

type Props = {
  snap: Snap
  onSnap: (snap: Snap) => void
  sheetRef: RefObject<HTMLElement | null>
}

// A move shorter than this is a tap, not a drag.
const TAP_SLOP = 6

/** The grip of the Place detail on a phone (SCRUM-167). Drag it to small, half or full; without
 * dragging, a tap or Enter goes to the next height and the arrow keys go one step up or down. */
export default function SheetGrip({ snap, onSnap, sheetRef }: Props) {
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null)

  function container() {
    const sheet = sheetRef.current
    return (sheet?.offsetParent as HTMLElement | null)?.clientHeight || window.innerHeight
  }

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    const sheet = sheetRef.current
    if (!sheet) return
    event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.current = { startY: event.clientY, startHeight: sheet.getBoundingClientRect().height, moved: false }
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const sheet = sheetRef.current
    const state = drag.current
    if (!sheet || !state) return
    const delta = event.clientY - state.startY
    if (Math.abs(delta) > TAP_SLOP) state.moved = true
    if (!state.moved) return
    // The sheet follows the finger; the snap state comes when the finger lets go.
    const height = Math.min(container(), Math.max(80, state.startHeight - delta))
    sheet.classList.add('dragging')
    sheet.style.height = `${height}px`
    sheet.style.maxHeight = `${height}px`
  }

  function onPointerUp() {
    const sheet = sheetRef.current
    const state = drag.current
    if (!sheet || !state?.moved) return
    const height = sheet.getBoundingClientRect().height
    sheet.classList.remove('dragging')
    sheet.style.height = ''
    sheet.style.maxHeight = ''
    onSnap(nearestSnap(height, container()))
  }

  function onClick() {
    // The click that ends a drag is no tap.
    const dragged = drag.current?.moved
    drag.current = null
    if (!dragged) onSnap(nextSnap(snap))
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    onSnap(stepSnap(snap, event.key === 'ArrowUp' ? 1 : -1))
  }

  return (
    <button
      type="button"
      className="place-detail-grip"
      aria-label={`Fenstergröße ${SNAP_LABEL[snap]}, ändern auf ${SNAP_LABEL[nextSnap(snap)]}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      <span className="place-detail-grip-bar" aria-hidden="true" />
    </button>
  )
}
