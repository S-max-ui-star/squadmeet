// The map keeps its center and zoom across a reload (SCRUM-77). Stored only in this browser.
// A private window or blocked storage throws; then the map starts as without a stored view.

export type MapView = { center: [number, number]; zoom: number }

const KEY = 'squadmeet.map-view'

export function loadMapView(minZoom: number): MapView | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const { lat, lon, zoom } = JSON.parse(raw)
    const valid =
      Number.isFinite(lat) && Math.abs(lat) <= 90 &&
      Number.isFinite(lon) && Math.abs(lon) <= 180 &&
      Number.isFinite(zoom) && zoom >= minZoom
    return valid ? { center: [lat, lon], zoom } : null
  } catch {
    return null
  }
}

export function saveMapView({ center: [lat, lon], zoom }: MapView): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat, lon, zoom }))
  } catch {
    // No storage: the next reload starts at the default view.
  }
}
