import { useCallback, useEffect, useState } from 'react'

const FROM_MAP = 'squadmeetPlaceFromMap'

// The Place detail page has its own URL, /platz/<id>, so it can be shared and reloaded.
// Caddy (production) and Vite (dev) answer every path with index.html.
export function placePath(id: number): string {
  return `/platz/${id}`
}

export function placeIdFromPath(path: string): number | null {
  const match = /^\/platz\/(\d+)\/?$/.exec(path)
  return match ? Number(match[1]) : null
}

// The current path, a link-like navigation function and a safe way to close a Place detail.
// A Place opened from the map goes back to that map entry. A shared direct URL is replaced by
// the map instead, so closing it cannot leave the app or immediately reopen the detail.
export function usePath(): [string, (to: string) => void, () => void] {
  const [path, setPath] = useState(window.location.pathname)

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((to: string) => {
    if (to !== window.location.pathname) {
      const opensPlace = placeIdFromPath(to) !== null
      const replacesPlace = opensPlace && placeIdFromPath(window.location.pathname) !== null
      const state = opensPlace
        ? { [FROM_MAP]: replacesPlace ? Boolean(window.history.state?.[FROM_MAP]) : window.location.pathname === '/' }
        : null
      if (replacesPlace) window.history.replaceState(state, '', to)
      else window.history.pushState(state, '', to)
    }
    setPath(to)
  }, [])

  const closePlace = useCallback(() => {
    if (window.history.state?.[FROM_MAP]) {
      window.history.back()
      return
    }
    window.history.replaceState(null, '', '/')
    setPath('/')
  }, [])

  return [path, navigate, closePlace]
}
