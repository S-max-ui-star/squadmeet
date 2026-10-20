import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import type { Place } from '../api/places'

// The zoom for a tap on a Notification (SCRUM-90): close enough to see the Place's street.
export const FOCUS_ZOOM = 17

type Props = {
  place: Place
  // A new number asks to zoom in on the Place, also when it is already visible (SCRUM-90).
  // Each number zooms once, so a reload of the Place does not undo the user's own zoom.
  focus?: number | null
}

type Size = { x: number; y: number }

// The part of the map that the detail panel does not cover: on a phone the panel covers the
// lower 60 % of the map, on a laptop a 360 px card on the left (index.css).
function freePart(size: Size) {
  const phone = size.x < 768
  return { phone, left: phone ? 0 : 384, bottom: phone ? size.y * 0.4 : size.y }
}

function inFreePart(point: Size, size: Size): boolean {
  const { left, bottom } = freePart(size)
  return point.x >= left && point.x <= size.x && point.y >= 0 && point.y <= bottom
}

// Shift the map so the Place sits in the free part: upper fifth (phone) or right of the card.
function shiftIntoFreePart(size: Size): [number, number] {
  const { phone, left } = freePart(size)
  return phone ? [0, size.y * 0.3] : [-left / 2, 0]
}

// Moves the map so the open Place is visible and not under the detail panel.
export default function CenterOn({ place, focus = null }: Props) {
  const map = useMap()
  const focused = useRef<number | null>(null)
  useEffect(() => {
    const zoomIn = focus !== null && focus !== focused.current
    focused.current = focus
    const size = map.getSize()
    const at: [number, number] = [place.lat, place.lon]
    if (!zoomIn && inFreePart(map.latLngToContainerPoint(at), size)) return
    let zoom = map.getBounds().contains(at) ? map.getZoom() : 16
    if (zoomIn) zoom = Math.max(map.getZoom(), FOCUS_ZOOM)
    map.setView(at, zoom, { animate: false })
    map.panBy(shiftIntoFreePart(size), { animate: false })
  }, [map, place, focus])
  return null
}
