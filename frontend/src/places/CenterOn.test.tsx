import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Place } from '../api/places'
import CenterOn, { FOCUS_ZOOM } from './CenterOn'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// A fake Leaflet map: the Place is always at `point`, the map has `size` and `zoom`.
const map = {
  size: { x: 1200, y: 800 },
  point: { x: 800, y: 300 },
  zoom: 14,
  getSize: () => map.size,
  latLngToContainerPoint: () => map.point,
  getBounds: () => ({ contains: () => true }),
  getZoom: () => map.zoom,
  setView: vi.fn(),
  panBy: vi.fn(),
}

vi.mock('react-leaflet', () => ({ useMap: () => map }))

const place: Place = {
  id: 3,
  name: 'Korb im Park',
  activity_type: 'basketball',
  lat: 51.33,
  lon: 12.36,
  people_now: 0,
  is_suggestion: false,
  confirmations: 0,
}

let container: HTMLDivElement
let root: Root

function show(props: { place: Place; focus?: number | null }) {
  act(() => root.render(<CenterOn {...props} />))
}

beforeEach(() => {
  map.size = { x: 1200, y: 800 }
  map.point = { x: 800, y: 300 }
  map.zoom = 14
  map.setView.mockClear()
  map.panBy.mockClear()
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(() => act(() => root.unmount()))

describe('CenterOn', () => {
  it('does not move the map when the Place is already in the free part', () => {
    show({ place })
    expect(map.setView).not.toHaveBeenCalled()
  })

  it('zooms in on a focus request although the Place is already visible', () => {
    show({ place, focus: 1 })
    expect(map.setView).toHaveBeenCalledWith([place.lat, place.lon], FOCUS_ZOOM, { animate: false })
    // Laptop: the Place sits right of the 360 px detail card.
    expect(map.panBy).toHaveBeenCalledWith([-192, 0], { animate: false })
  })

  it('keeps a closer zoom on a focus request', () => {
    map.zoom = FOCUS_ZOOM + 1
    show({ place, focus: 1 })
    expect(map.setView).toHaveBeenCalledWith([place.lat, place.lon], FOCUS_ZOOM + 1, { animate: false })
  })

  it('puts the Place above the detail panel on a phone', () => {
    map.size = { x: 400, y: 800 }
    map.point = { x: 200, y: 200 }
    show({ place, focus: 1 })
    expect(map.setView).toHaveBeenCalledWith([place.lat, place.lon], FOCUS_ZOOM, { animate: false })
    expect(map.panBy).toHaveBeenCalledWith([0, 240], { animate: false })
  })

  it('zooms only once per focus request, not again when the Place loads again', () => {
    show({ place, focus: 1 })
    map.setView.mockClear()
    show({ place: { ...place, people_now: 2 }, focus: 1 })
    expect(map.setView).not.toHaveBeenCalled()
    show({ place, focus: 2 })
    expect(map.setView).toHaveBeenCalledTimes(1)
  })
})
