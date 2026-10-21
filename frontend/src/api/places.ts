import { answer } from './http'


export type Place = {
  id: number
  name: string
  activity_type: string
  lat: number
  lon: number
  // Nearest address, loaded once from the address provider and then stored by the backend.
  address?: string | null
  // Party sizes of the Meetups at the Place right now; 0 = nobody is there (SCRUM-29).
  people_now: number
  // A Place suggestion and its Confirmations so far (SCRUM-30); it needs 3 to become a Place.
  is_suggestion: boolean
  confirmations: number
  // A suggestion with 3 Confirmations that waits for an Admin approval (SCRUM-56).
  waiting_for_admin?: boolean
  // Open Place reports and their most common reason (SCRUM-57); null = no open report.
  open_reports?: number
  report_reason?: PlaceReportReason | null
}

export type PlaceReportReason = 'not_existing' | 'not_public' | 'dangerous'

// The fixed reasons of a Place report (backend: PLACE_REPORT_REASONS), no free text (ADR-0004).
export const REPORT_REASONS: Record<PlaceReportReason, string> = {
  not_existing: 'Gibt es nicht',
  not_public: 'Nicht öffentlich',
  dangerous: 'Gefährlich',
}

// From this many users a reported Place leaves the map until an Admin decides.
export const REPORTS_TO_HIDE = 3

/** "Melden" (SCRUM-57). A second open report of the same user answers 409. */
export async function reportPlace(token: string, placeId: number, reason: PlaceReportReason): Promise<void> {
  const response = await fetch(`/api/places/${placeId}/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ reason }),
  })
  if (!response.ok) await answer(response, 'POST place report')
}

// The visible map area in degrees, in the order the API expects.
export type MapArea = { west: number; south: number; east: number; north: number }

// `truncated`: the area has more Places than the API sends; the map asks the user to zoom in.
export type PlacesAnswer = { places: Place[]; truncated: boolean }

export type PlaceSearchHit = {
  kind: 'place' | 'address'
  label: string
  lat: number
  lon: number
  place_id: number | null
}

// Leaflet reports longitudes beyond ±180 when the map shows the world more than once; the API
// accepts only real coordinates.
export function clampArea(area: MapArea): MapArea {
  const longitudeSpan = area.east - area.west
  let west = area.west
  let east = area.east

  if (longitudeSpan >= 360 || longitudeSpan <= 0) {
    west = -180
    east = 180
  } else {
    const worldCopies = Math.floor((west + 180) / 360)
    west -= worldCopies * 360
    east -= worldCopies * 360
    if (east > 180) {
      west -= 360
      east -= 360
    }
    west = Math.max(-180, Math.min(180, west))
    east = Math.max(-180, Math.min(180, east))
    if (west >= east) {
      west = -180
      east = 180
    }
  }

  let south = Math.max(-90, Math.min(90, area.south))
  let north = Math.max(-90, Math.min(90, area.north))
  if (south >= north) {
    south = -90
    north = 90
  }

  return {
    west,
    south,
    east,
    north,
  }
}

// With a login token, the count of people leaves out Meetups of users who blocked the user
// (SCRUM-32).
function withToken(token: string | null | undefined) {
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {}
}

export async function fetchPlaces(area: MapArea, signal?: AbortSignal, token?: string | null): Promise<PlacesAnswer> {
  const { west, south, east, north } = clampArea(area)
  const bbox = [west, south, east, north].map((v) => v.toFixed(5)).join(',')
  const response = await fetch(`/api/places?bbox=${bbox}`, { signal, ...withToken(token) })
  if (!response.ok) {
    throw new Error(`GET /api/places failed: ${response.status}`)
  }
  return { places: await response.json(), truncated: response.headers.get('X-Places-Truncated') === 'true' }
}

export async function fetchPlace(id: number, token?: string | null): Promise<Place> {
  const response = token ? await fetch(`/api/places/${id}`, withToken(token)) : await fetch(`/api/places/${id}`)
  if (response.status === 404) {
    throw new Error('Diesen Platz gibt es nicht (mehr).')
  }
  if (!response.ok) {
    throw new Error(`GET /api/places/${id} failed: ${response.status}`)
  }
  return response.json()
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceSearchHit[]> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal })
  if (!response.ok) {
    throw new Error(`GET /api/search failed: ${response.status}`)
  }
  return response.json()
}
