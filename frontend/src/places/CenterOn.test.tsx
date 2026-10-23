import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Place } from '../api/places'
import CenterOn, { FOCUS_ZOOM } from './CenterOn'
import { freePart, inFreePart, panIntoFreePart } from './freePart'

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
  getContainer: () => ({ getBoundingClientRect: () => ({ top: 0, left: 0 }) }),
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

afterEach(() => {
  act(() => root.unmount())
  document.body.innerHTML = ''
})

// An element over the map with this top and bottom, like the filters or the sheet.
function overlay(className: string, top: number, bottom: number, attributes: Record<string, string> = {}) {
  const element = document.createElement('div')
  element.className = className
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  element.getBoundingClientRect = () => ({ top, bottom, height: bottom - top }) as DOMRect
  document.body.append(element)
  return element
}

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

  it('puts the Place below the top controls and above the half sheet on a phone (SCRUM-173)', () => {
    map.size = { x: 390, y: 800 }
    map.point = { x: 195, y: 400 }
    overlay('account', 8, 52)
    overlay('activity-filter', 152, 196)
    overlay('place-detail', 320, 800, { 'data-snap': 'half' })

    show({ place })

    // Free part 196–320, its middle 258: from the middle of the map (400) pan 142 px.
    expect(map.panBy).toHaveBeenCalledWith([0, 142], { animate: false })
  })

  it('does not move a Place that is already between the controls and the sheet', () => {
    map.size = { x: 390, y: 800 }
    map.point = { x: 195, y: 250 }
    overlay('activity-filter', 152, 196)
    overlay('place-detail', 320, 800, { 'data-snap': 'half' })

    show({ place })

    expect(map.setView).not.toHaveBeenCalled()
  })

  it('pans the Place back into view when the sheet gets a new height, without a zoom', async () => {
    map.size = { x: 390, y: 800 }
    map.point = { x: 195, y: 250 }
    overlay('activity-filter', 152, 196)
    const sheet = overlay('place-detail', 220, 800, { 'data-snap': 'small' })
    show({ place })
    expect(map.panBy).not.toHaveBeenCalled()

    // Small → half: the sheet now starts at 320; the Place at 250 is still free, then at 400 not.
    map.point = { x: 195, y: 400 }
    await act(async () => sheet.setAttribute('data-snap', 'half'))

    expect(map.setView).not.toHaveBeenCalled()
    expect(map.panBy).toHaveBeenCalledWith([0, 142], { animate: true })
  })

  it('leaves the map alone behind a full sheet', async () => {
    map.size = { x: 390, y: 800 }
    map.point = { x: 195, y: 700 }
    overlay('activity-filter', 152, 196)
    const sheet = overlay('place-detail', 0, 800, { 'data-snap': 'full' })

    show({ place: { ...place, people_now: 1 } })
    await act(async () => sheet.setAttribute('data-snap', 'full'))

    expect(map.setView).not.toHaveBeenCalled()
    expect(map.panBy).not.toHaveBeenCalled()
  })
})

describe('free part of the map (SCRUM-173)', () => {
  const phone = { x: 390, y: 800 }

  it('starts below the top controls and ends at the top of the sheet for each height', () => {
    expect(freePart(phone, 196, 'small')).toEqual({ phone: true, left: 0, top: 196, bottom: 580 })
    expect(freePart(phone, 196, 'half')).toEqual({ phone: true, left: 0, top: 196, bottom: 320 })
    expect(freePart(phone, 196, 'full')).toEqual({ phone: true, left: 0, top: 196, bottom: 0 })
  })

  it('is right of the card on a laptop, as before', () => {
    const laptop = { x: 1200, y: 800 }
    const free = freePart(laptop, 196, 'half')

    expect(free).toEqual({ phone: false, left: 384, top: 0, bottom: 800 })
    expect(inFreePart({ x: 300, y: 100 }, laptop, free)).toBe(false)
    expect(panIntoFreePart({ x: 600, y: 400 }, laptop, free)).toEqual([-192, 0])
  })

  it('counts a Place under the filters as hidden', () => {
    const free = freePart(phone, 196, 'half')

    expect(inFreePart({ x: 195, y: 170 }, phone, free)).toBe(false)
    expect(inFreePart({ x: 195, y: 250 }, phone, free)).toBe(true)
  })
})
