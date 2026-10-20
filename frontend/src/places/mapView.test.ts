import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadMapView, saveMapView } from './mapView'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('stored map view', () => {
  it('gives back the saved center and zoom', () => {
    saveMapView({ center: [52.39, 13.06], zoom: 15 })
    expect(loadMapView(11)).toEqual({ center: [52.39, 13.06], zoom: 15 })
  })

  it('is empty on the first visit', () => {
    expect(loadMapView(11)).toBeNull()
  })

  it('ignores broken or out-of-range values', () => {
    localStorage.setItem('squadmeet.map-view', 'nonsense')
    expect(loadMapView(11)).toBeNull()
    localStorage.setItem('squadmeet.map-view', JSON.stringify({ lat: 51, lon: 12, zoom: 5 }))
    expect(loadMapView(11)).toBeNull()
    localStorage.setItem('squadmeet.map-view', JSON.stringify({ lat: 'x', lon: 12, zoom: 13 }))
    expect(loadMapView(11)).toBeNull()
  })

  it('works without storage (private window)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveMapView({ center: [51, 12], zoom: 13 })).not.toThrow()
    expect(loadMapView(11)).toBeNull()
  })
})
