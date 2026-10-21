// Ratings (SCRUM-31): the API of backend/app/ratings.py.

import { answer } from './http'

export type Reason = { key: string; label: string; positive: boolean }

export type ReasonCount = Reason & {
  count: number
  // Set when these Ratings name an issue that users said is fixed: the time of the fix (SCRUM-99).
  fixed_at?: string | null
}

// A problem named in Ratings; `count` is the number of Ratings since the last fix that name it.
export type Issue = ReasonCount & {
  // Not confirmed for two months: users are asked "Ist das noch so?".
  needs_check: boolean
  // The votes of the open check so far; 3 on one side decide.
  still_there_votes: number
  fixed_votes: number
}

export type Condition = {
  // unknown = no Rating or vote in two months and no issue; good = no issue; issues = some.
  state: 'unknown' | 'good' | 'issues'
  issues: Issue[]
}

export type RatingSummary = {
  count: number
  // null while nobody rated the Place.
  average_stars: number | null
  top_reasons: ReasonCount[]
  condition: Condition
}

export type Rating = { place_id: number; stars: number; reasons: string[]; updated_at: string }

export type RatingInput = { stars: number; reasons: string[] }

export async function fetchReasons(placeId: number): Promise<Reason[]> {
  return answer(await fetch(`/api/places/${placeId}/reasons`), 'GET reasons')
}

/** With the token of an Admin, also for a Place that users reported (SCRUM-57). */
export async function fetchRatingSummary(placeId: number, token?: string | null): Promise<RatingSummary> {
  const init = token ? { headers: { Authorization: `Bearer ${token}` } } : undefined
  return answer(await fetch(`/api/places/${placeId}/ratings`, init), 'GET ratings')
}

/** The user's own Rating of the Place, or null. */
export async function fetchMyRating(token: string, placeId: number): Promise<Rating | null> {
  const response = await fetch(`/api/places/${placeId}/ratings/mine`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return answer(response, 'GET my rating')
}

/** Rates the Place, or replaces the user's earlier Rating of it. */
export async function saveRating(token: string, placeId: number, input: RatingInput): Promise<Rating> {
  const response = await fetch(`/api/places/${placeId}/ratings/mine`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  return answer(response, 'PUT rating')
}

/** "Ist das noch so?" for an issue whose check is open. Returns the new summary. */
export async function voteOnIssue(
  token: string,
  placeId: number,
  reasonKey: string,
  stillThere: boolean,
): Promise<RatingSummary> {
  const response = await fetch(`/api/places/${placeId}/condition/${reasonKey}/check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ still_there: stillThere }),
  })
  return answer(response, 'POST condition check')
}
