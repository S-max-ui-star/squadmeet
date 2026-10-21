import { afterEach, describe, expect, it, vi } from 'vitest'
import { clampArea, fetchPlace, fetchPlaces, searchPlaces, type MapArea, type Place } from './places'

const place: Place = {
  id: 1,
  name: 'Tischtennisplatte',
  activity_type: 'table_tennis',
  lat: 51.33,
  lon: 12.36,
  address: null,
  people_now: 0,
  is_suggestion: false,
  confirmations: 0,
}

const leipzig: MapArea = { west: 12.3, south: 51.3, east: 12.4, north: 51.35 }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('fetchPlaces', () => {
  it('asks for the Places inside the map area', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([place]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPlaces(leipzig)).resolves.toEqual({ places: [place], truncated: false })
    expect(fetchMock).toHaveBeenCalledWith('/api/places?bbox=12.30000,51.30000,12.40000,51.35000', {
      signal: undefined,
    })
  })

  it('reports when the API left Places out', async () => {
    const answer = Response.json([place], { headers: { 'X-Places-Truncated': 'true' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer))

    await expect(fetchPlaces(leipzig)).resolves.toEqual({ places: [place], truncated: true })
  })

  it('passes the abort signal on', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    const request = new AbortController()

    await fetchPlaces(leipzig, request.signal)

    expect(fetchMock.mock.calls[0][1]).toEqual({ signal: request.signal })
  })

  it('throws when the API answers with an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 500 })))

    await expect(fetchPlaces(leipzig)).rejects.toThrow('500')
  })
})

describe('clampArea', () => {
  it('keeps longitudes and latitudes inside the real range', () => {
    expect(clampArea({ west: -250, south: -95, east: 400, north: 91 })).toEqual({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    })
  })

  it('normalizes positive and negative Leaflet world copies', () => {
    expect(clampArea({ west: 190, south: 10, east: 200, north: 20 })).toEqual({
      west: -170,
      south: 10,
      east: -160,
      north: 20,
    })
    expect(clampArea({ west: -200, south: 10, east: -190, north: 20 })).toEqual({
      west: 160,
      south: 10,
      east: 170,
      north: 20,
    })
  })

  it('returns a valid area at the antimeridian and for invalid bounds', () => {
    const crossing = clampArea({ west: 170, south: 10, east: 190, north: 20 })
    expect(crossing.west).toBeLessThan(crossing.east)
    expect(clampArea({ west: 20, south: 30, east: 10, north: 20 })).toEqual({
      west: -180,
      south: -90,
      east: 180,
      north: 90,
    })
  })

  it('leaves a normal area as it is', () => {
    expect(clampArea(leipzig)).toEqual(leipzig)
  })
})

describe('fetchPlace', () => {
  it('asks for one Place by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(place))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchPlace(1)).resolves.toEqual(place)
    expect(fetchMock).toHaveBeenCalledWith('/api/places/1')
  })

  it('says in German when the Place does not exist', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 404 })))

    await expect(fetchPlace(9)).rejects.toThrow('Diesen Platz gibt es nicht')
  })
})

describe('searchPlaces', () => {
  it('encodes the submitted query', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(searchPlaces('Karl-Liebknecht-Str. 20')).resolves.toEqual([])

    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=Karl-Liebknecht-Str.%2020', { signal: undefined })
  })

  it('passes an abort signal to search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([]))
    vi.stubGlobal('fetch', fetchMock)
    const request = new AbortController()

    await searchPlaces('Park', request.signal)

    expect(fetchMock).toHaveBeenCalledWith('/api/search?q=Park', { signal: request.signal })
  })
})
