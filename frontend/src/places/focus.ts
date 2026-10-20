import { useCallback, useEffect, useRef, useState } from 'react'
import { placeIdFromPath } from './route'

// A request to zoom in on a Place after a tap on a Notification (SCRUM-90). Each tap gets a new
// `request` number, so a second tap on the same Place zooms in again.
export type FocusRequest = { id: number; request: number }

// A tap on a web push opens /platz/<id>#treffen-<Meetup id> (backend/app/push_delivery.py).
function fromPushLink(): number | null {
  if (!/^#treffen-\d+$/.test(window.location.hash)) return null
  return placeIdFromPath(window.location.pathname)
}

export function useFocusRequest(): [FocusRequest | null, (id: number) => void] {
  const count = useRef(0)
  const [focus, setFocus] = useState<FocusRequest | null>(() => {
    const id = fromPushLink()
    return id === null ? null : { id, request: 0 }
  })

  const focusOn = useCallback((id: number) => {
    count.current += 1
    setFocus({ id, request: count.current })
  }, [])

  // The service worker opens the push link in the open window. When only the hash changes,
  // the page does not load again, so the hash change starts the request.
  useEffect(() => {
    const onHashChange = () => {
      const id = fromPushLink()
      if (id !== null) focusOn(id)
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [focusOn])

  return [focus, focusOn]
}
