// Meetups: Now-meetups (SCRUM-29), later Meetups (SCRUM-35), Joins (SCRUM-34), and the Host's
// Cancel, Leave and move with Joins (SCRUM-37): the API of backend/app/meetups.py.

import { answer } from './http'
import { clampArea, type MapArea, type Place } from './places'

export type MeetupHost = { id: number; nickname: string; avatar: string }

export type Participant = MeetupHost & { party_size: number }

// The Host moved the Meetup; the viewer has not chosen go along / stay / leave yet.
export type MoveOffer = { meetup_id: number; host: MeetupHost; starts_at: string; ends_at: string }

export type MoveAnswer = 'go' | 'stay' | 'leave'
export type TimeSpan = 'now' | '3h' | '6h' | 'today'

export type Meetup = {
  id: number
  place_id: number
  // null for a guest: only logged-in users see who comes.
  host: MeetupHost | null
  // The Host's Party size, the Host included.
  party_size: number
  // The Host's Party plus every Join.
  people: number
  // The users who joined, the earliest first; null for a guest.
  participants: Participant[] | null
  // The viewer's Contacts among Host and participants, Host first; null for a guest.
  contacts: MeetupHost[] | null
  // ISO 8601 with time zone, e.g. "2026-10-12T09:00:00Z".
  starts_at: string
  ends_at: string
  // The Host called it off before the start; it stays listed until its end time.
  cancelled: boolean
  move_offer: MoveOffer | null
  // The viewer is in this Meetup, and so is someone they blocked (SCRUM-32).
  blocked_user_in: boolean
  // An Occurrence of a weekly Series (SCRUM-38).
  series_id: number | null
  // SCRUM-61: the state now and what the viewer may do, worked out by the server. The UI shows
  // only these buttons; a guest gets "join", which asks them to log in.
  state: MeetupState
  actions: MeetupAction[]
}

export type MeetupState = 'upcoming' | 'live' | 'ended' | 'cancelled' | 'closed'

export type MeetupAction = 'join' | 'leave' | 'cancel' | 'end' | 'move' | 'cancel_series' | 'invite'

// Without starts_at a Now-meetup; with it a later Meetup (ISO 8601 with time zone).
export type MeetupInput = { place_id: number; hours: number; party_size: number; starts_at?: string }

export type MapMeetups = { places: Place[]; meetups: Meetup[]; truncated: boolean }

export async function fetchMapMeetups(
  area: MapArea,
  span: TimeSpan,
  signal?: AbortSignal,
  token: string | null = null,
): Promise<MapMeetups> {
  const { west, south, east, north } = clampArea(area)
  const bbox = [west, south, east, north].map((value) => value.toFixed(5)).join(',')
  const query = new URLSearchParams({ bbox, time: span })
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined
  const response = await fetch(`/api/meetups?${query}`, { signal, ...(headers ? { headers } : {}) })
  return answer(response, 'GET map meetups')
}

// With a login token the answer names the Host and the participants.
export async function fetchMeetups(placeId: number, token: string | null = null): Promise<Meetup[]> {
  const url = `/api/places/${placeId}/meetups`
  const response = token ? await fetch(url, { headers: { Authorization: `Bearer ${token}` } }) : await fetch(url)
  return answer(response, 'GET meetups')
}

export async function createMeetup(token: string, input: MeetupInput): Promise<Meetup> {
  const response = await fetch('/api/meetups', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  return answer(response, 'POST meetup')
}

export async function endMeetup(token: string, meetupId: number): Promise<Meetup> {
  const response = await fetch(`/api/meetups/${meetupId}/end`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return answer(response, 'POST end meetup')
}

// The Host moves the start of a Meetup that has not started yet; the duration stays.
export async function moveMeetupStart(token: string, meetupId: number, startsAt: string): Promise<Meetup> {
  const response = await fetch(`/api/meetups/${meetupId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ starts_at: startsAt }),
  })
  return answer(response, 'PATCH meetup')
}

// "Ich komme mit" with the user's Party size.
export async function joinMeetup(token: string, meetupId: number, partySize: number): Promise<Meetup> {
  const response = await fetch(`/api/meetups/${meetupId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ party_size: partySize }),
  })
  return answer(response, 'POST join')
}

export async function leaveMeetup(token: string, meetupId: number): Promise<void> {
  const response = await fetch(`/api/meetups/${meetupId}/join`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) await answer(response, 'DELETE join')
}

// Absagen: the Host calls off a Meetup before it starts.
export async function cancelMeetup(token: string, meetupId: number): Promise<Meetup> {
  const response = await fetch(`/api/meetups/${meetupId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return answer(response, 'POST cancel')
}

export async function answerMove(token: string, meetupId: number, choice: MoveAnswer): Promise<Meetup> {
  const response = await fetch(`/api/meetups/${meetupId}/move-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ answer: choice }),
  })
  return answer(response, 'POST move answer')
}

// A weekly Series (SCRUM-38): weekday 0 = Monday, the time in Berlin ("19:00"), 1–4 hours.
export type SeriesInput = {
  place_id: number
  slots: { weekday: number; time: string; hours: number }[]
  party_size: number
  // "2026-12-31", or null for no end.
  until: string | null
}

export async function createSeries(token: string, input: SeriesInput): Promise<{ id: number }> {
  const response = await fetch('/api/meetup-series', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  return answer(response, 'POST series')
}

export async function cancelSeries(token: string, seriesId: number): Promise<{ id: number }> {
  const response = await fetch(`/api/meetup-series/${seriesId}/cancel`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  return answer(response, 'POST cancel series')
}

// "Kontakte einladen" (SCRUM-43): the number of new invitations (Contacts already in the Meetup
// or already invited are not counted).
export async function inviteContacts(token: string, meetupId: number, userIds: number[]): Promise<number> {
  const response = await fetch(`/api/meetups/${meetupId}/invite`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ user_ids: userIds }),
  })
  const body = await answer<{ invited: number }>(response, 'POST invite')
  return body.invited
}
