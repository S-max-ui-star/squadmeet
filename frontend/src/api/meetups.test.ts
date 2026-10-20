import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  answerMove,
  cancelMeetup,
  createMeetup,
  endMeetup,
  fetchMapMeetups,
  fetchMeetups,
  joinMeetup,
  leaveMeetup,
  moveMeetupStart,
  type Meetup,
} from './meetups'

const meetup: Meetup = {
  id: 7,
  place_id: 3,
  host: { id: 1, nickname: 'Paula', avatar: 'fox' },
  party_size: 2,
  people: 2,
  participants: [],
  contacts: [],
  cancelled: false,
  move_offer: null,
  blocked_user_in: false,
  series_id: null as number | null,
  state: 'upcoming',
  actions: [],
  starts_at: '2026-10-12T09:00:00Z',
  ends_at: '2026-10-12T11:00:00Z',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('meetups API', () => {
  it('asks for one Time filter in the visible map area', async () => {
    const answer = { places: [], meetups: [meetup], truncated: false }
    const fetchMock = vi.fn().mockResolvedValue(Response.json(answer))
    vi.stubGlobal('fetch', fetchMock)
    const area = { west: 12.3, south: 51.3, east: 12.4, north: 51.35 }

    await expect(fetchMapMeetups(area, '3h')).resolves.toEqual(answer)

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/meetups?bbox=12.30000%2C51.30000%2C12.40000%2C51.35000&time=3h',
      { signal: undefined },
    )
  })

  it('lists the Meetups of a Place', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([meetup]))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchMeetups(3)).resolves.toEqual([meetup])
    expect(fetchMock).toHaveBeenCalledWith('/api/places/3/meetups')
  })

  it('creates a Now-meetup with the login token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(meetup, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await createMeetup('tok', { place_id: 3, hours: 2, party_size: 2 })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/meetups')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({ place_id: 3, hours: 2, party_size: 2 })
  })

  it('creates a later Meetup with its start time', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(meetup, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const input = { place_id: 3, hours: 2, party_size: 1, starts_at: '2026-10-17T16:00:00.000Z' }

    await createMeetup('tok', input)

    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(input)
  })

  it('moves the start of a Meetup', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(meetup))
    vi.stubGlobal('fetch', fetchMock)

    await moveMeetupStart('tok', 7, '2026-10-18T16:00:00.000Z')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/meetups/7')
    expect(init.method).toBe('PATCH')
    expect(init.headers.Authorization).toBe('Bearer tok')
    expect(JSON.parse(init.body)).toEqual({ starts_at: '2026-10-18T16:00:00.000Z' })
  })

  it('sends the login token when there is one, so the answer names who comes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([meetup]))
    vi.stubGlobal('fetch', fetchMock)

    await fetchMeetups(3, 'tok')

    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('joins with a Party size and leaves', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(meetup, { status: 201 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await joinMeetup('tok', 7, 3)
    await leaveMeetup('tok', 7)

    const [joinUrl, joinInit] = fetchMock.mock.calls[0]
    expect([joinUrl, joinInit.method, JSON.parse(joinInit.body)]).toEqual(['/api/meetups/7/join', 'POST', { party_size: 3 }])
    const [leaveUrl, leaveInit] = fetchMock.mock.calls[1]
    expect([leaveUrl, leaveInit.method]).toEqual(['/api/meetups/7/join', 'DELETE'])
  })

  it("shows the server's message when a Join is refused", async () => {
    const answer = Response.json({ detail: 'Du bist schon dabei' }, { status: 409 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer))

    await expect(joinMeetup('tok', 7, 1)).rejects.toThrow('Du bist schon dabei')
  })

  it('cancels and answers a move (SCRUM-37)', async () => {
    const fetchMock = vi.fn(async () => Response.json(meetup))
    vi.stubGlobal('fetch', fetchMock)

    await cancelMeetup('tok', 7)
    await answerMove('tok', 7, 'go')

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect([calls[0][0], calls[0][1].method]).toEqual(['/api/meetups/7/cancel', 'POST'])
    expect(calls[1][0]).toBe('/api/meetups/7/move-answer')
    expect(JSON.parse(calls[1][1].body as string)).toEqual({ answer: 'go' })
  })

  it("shows the server's message when the Host may not end it", async () => {
    const answer = Response.json({ detail: 'Nur der Gastgeber kann das Treffen beenden' }, { status: 403 })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(answer))

    await expect(endMeetup('tok', 7)).rejects.toThrow('Nur der Gastgeber')
  })
})
