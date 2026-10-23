import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { Map as LeafletMap } from 'leaflet'
import type { Place } from '../api/places'
import { freePart, inFreePart, panIntoFreePart, type FreePart } from './freePart'
import type { Snap } from './sheetSnap'

// The zoom for a tap on a Notification (SCRUM-90): close enough to see the Place's street.
export const FOCUS_ZOOM = 17

type Props = {
  place: Place
  // A new number asks to zoom in on the Place, also when it is already visible (SCRUM-90).
  // Each number zooms once, so a reload of the Place does not undo the user's own zoom.
  focus?: number | null
}

// Smaller than this, there is no room to show the Place (the sheet is full).
const MIN_FREE_HEIGHT = 48

// The controls that float over the top of the map on a phone (index.css).
const TOP_CONTROLS = '.account, .place-search, .map-toolbar, .time-filter, .activity-filter'

function measure(map: LeafletMap): FreePart {
  const size = map.getSize()
  const box = map.getContainer().getBoundingClientRect()
  let topCovered = 0
  for (const control of document.querySelectorAll(TOP_CONTROLS)) {
    const rect = control.getBoundingClientRect()
    // Hidden controls have no size; the bottom bar and the sheet are not top controls.
    if (rect.height > 0 && rect.top - box.top < size.y / 2) topCovered = Math.max(topCovered, rect.bottom - box.top)
  }
  const snap = (document.querySelector<HTMLElement>('.place-detail')?.dataset.snap as Snap | undefined) ?? 'half'
  return freePart(size, topCovered, snap)
}

// Moves the map so the open Place is visible and not under the detail panel or the top controls.
export default function CenterOn({ place, focus = null }: Props) {
  const map = useMap()
  const focused = useRef<number | null>(null)
  useEffect(() => {
    const zoomIn = focus !== null && focus !== focused.current
    focused.current = focus
    const size = map.getSize()
    const at: [number, number] = [place.lat, place.lon]
    const free = measure(map)
    const noRoom = free.bottom - free.top < MIN_FREE_HEIGHT
    // A full sheet hides the map: a reload of the Place must not move it behind the sheet.
    if (!zoomIn && (noRoom || inFreePart(map.latLngToContainerPoint(at), size, free))) return
    let zoom = map.getBounds().contains(at) ? map.getZoom() : 16
    if (zoomIn) zoom = Math.max(map.getZoom(), FOCUS_ZOOM)
    map.setView(at, zoom, { animate: false })
    if (noRoom) return
    // setView put the Place in the middle of the map.
    map.panBy(panIntoFreePart({ x: size.x / 2, y: size.y / 2 }, size, free), { animate: false })
  }, [map, place, focus])

  // A new sheet height (SCRUM-167) can cover the Place: pan it back into view, same zoom.
  useEffect(() => {
    const sheet = document.querySelector('.place-detail')
    if (!sheet) return
    const observer = new MutationObserver(() => {
      const size = map.getSize()
      const free = measure(map)
      const point = map.latLngToContainerPoint([place.lat, place.lon])
      if (free.bottom - free.top < MIN_FREE_HEIGHT || inFreePart(point, size, free)) return
      map.panBy(panIntoFreePart(point, size, free), { animate: true })
    })
    observer.observe(sheet, { attributes: true, attributeFilter: ['data-snap'] })
    return () => observer.disconnect()
  }, [map, place])
  return null
}
