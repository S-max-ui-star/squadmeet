// Admin: lock, unlock and delete a Place (SCRUM-39): the API of backend/app/admin_places.py.
// Approve or reject a Place suggestion (SCRUM-56): backend/app/admin_suggestions.py.
// Dismiss Place reports (SCRUM-57): backend/app/place_reports.py.
// The server allows it only for an Admin with MFA on.
import type { User } from './auth'
import { answer } from './http'
import type { PlaceReportReason } from './places'

export type LockedPlace = {
  id: number
  name: string
  activity_type: string
  address: string | null
  locked_at: string
}

// "building", "private", "residential": only a hint from OSM, never a block.
// [] = OSM shows nothing there; null = OSM did not answer (no hint).
export type OsmHint = 'building' | 'private' | 'residential'

export type WaitingSuggestion = {
  id: number
  name: string
  activity_type: string
  lat: number
  lon: number
  address: string | null
  confirmations: number
  // Open Place reports; approve and reject close them (SCRUM-71).
  open_reports: number
  suggested_at: string
  confirmed_at: string
  // The Admin may approve 24 h after the suggestion at the earliest.
  approvable_from: string
  approvable: boolean
  osm_hints: OsmHint[] | null
}

export type ReportedPlace = {
  id: number
  name: string
  activity_type: string
  lat: number
  lon: number
  address: string | null
  // The number of open reports per reason.
  reasons: Partial<Record<PlaceReportReason, number>>
  first_reported_at: string
  // Off the map: 3 users reported it.
  hidden: boolean
}

/** The server checks the same: an Admin without MFA gets 403. */
export function canModerate(user: User | null | undefined): boolean {
  return !!user && user.is_admin && user.mfa_enabled
}

function call(token: string, method: string, path: string, base = '/api/admin/places') {
  return fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}` } })
}

const SUGGESTIONS = '/api/admin/place-suggestions'
const REPORTS = '/api/admin/place-reports'

// 204 answers have no body, so `answer` (which reads JSON) is only used on errors.
async function noContent(response: Response, what: string): Promise<void> {
  if (!response.ok) await answer(response, what)
}

export async function lockPlace(token: string, placeId: number): Promise<void> {
  await noContent(await call(token, 'POST', `/${placeId}/lock`), 'POST lock place')
}

export async function unlockPlace(token: string, placeId: number): Promise<void> {
  await noContent(await call(token, 'POST', `/${placeId}/unlock`), 'POST unlock place')
}

export async function deletePlace(token: string, placeId: number): Promise<void> {
  await noContent(await call(token, 'DELETE', `/${placeId}`), 'DELETE place')
}

export async function fetchLockedPlaces(token: string): Promise<LockedPlace[]> {
  return answer(await call(token, 'GET', '/locked'), 'GET locked places')
}

export async function fetchWaitingSuggestions(token: string): Promise<WaitingSuggestion[]> {
  return answer(await call(token, 'GET', '', SUGGESTIONS), 'GET waiting suggestions')
}

export async function approveSuggestion(token: string, placeId: number): Promise<void> {
  await noContent(await call(token, 'POST', `/${placeId}/approve`, SUGGESTIONS), 'POST approve suggestion')
}

export async function rejectSuggestion(token: string, placeId: number): Promise<void> {
  await noContent(await call(token, 'POST', `/${placeId}/reject`, SUGGESTIONS), 'POST reject suggestion')
}

export async function fetchReportedPlaces(token: string): Promise<ReportedPlace[]> {
  return answer(await call(token, 'GET', '', REPORTS), 'GET reported places')
}

export async function dismissReports(token: string, placeId: number): Promise<void> {
  await noContent(await call(token, 'POST', `/${placeId}/dismiss`, REPORTS), 'POST dismiss reports')
}
