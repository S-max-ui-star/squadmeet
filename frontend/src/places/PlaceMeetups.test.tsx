import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/auth'
import { announceMeetupChange } from '../api/live'
import PlaceMeetups from './PlaceMeetups'
import { startChoice } from './meetupTime'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const paula: User = { id: 1, nickname: 'Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

// The server works out state and actions per viewer (SCRUM-61); the fixtures carry what it
// would send. Running now, as its Host Paula sees it.
const meetup = {
  id: 7,
  place_id: 3,
  host: { id: 1, nickname: 'Paula', avatar: 'fox' },
  party_size: 3,
  people: 3,
  participants: [] as { id: number; nickname: string; avatar: string; party_size: number }[],
  cancelled: false,
  blocked_user_in: false,
  series_id: null as number | null,
  state: 'live',
  actions: ['end', 'leave'] as string[],
  move_offer: null as null | { meetup_id: number; host: { id: number; nickname: string; avatar: string }; starts_at: string; ends_at: string },
  starts_at: hoursFromNow(-1),
  ends_at: hoursFromNow(1),
}

// As a guest sees it (SCRUM-34): only the number of people; "join" asks to log in.
const guestView = { ...meetup, host: null, participants: null, actions: ['join'] }

// As another logged-in user sees it, before and after joining.
const asOther = <T extends object>(m: T) => ({ ...m, actions: ['join'] })
const asJoined = <T extends object>(m: T) => ({ ...m, actions: ['leave'] })

const karl: User = { ...paula, id: 2, nickname: 'Korb_Karl', avatar: 'bear' }

// Starts tomorrow (SCRUM-35), as its Host Paula sees it.
const laterMeetup = {
  ...meetup,
  id: 8,
  starts_at: hoursFromNow(24),
  ends_at: hoursFromNow(26),
  state: 'upcoming',
  actions: ['cancel', 'move', 'leave'],
}

// Unmounted after each test, so an old panel does not answer the next test's events.
const roots: Root[] = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  localStorage.clear()
  window.location.hash = ''
})

async function render(user: User | null, onLoginNeeded = () => {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () =>
    root.render(
      <PlaceMeetups placeId={3} user={user} onLoginNeeded={onLoginNeeded} onChanged={() => {}} />,
    ),
  )
  return container
}

function renderPending(user: User | null) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<PlaceMeetups placeId={3} user={user} onLoginNeeded={() => {}} onChanged={() => {}} />))
  return container
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

describe('PlaceMeetups', () => {
  it('loads again on a live Meetup event for its own Place only (SCRUM-93)', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json([meetup])))
    vi.stubGlobal('fetch', fetch)
    await render(paula)
    expect(fetch).toHaveBeenCalledTimes(1)

    await act(async () => announceMeetupChange(4))
    expect(fetch).toHaveBeenCalledTimes(1)
    await act(async () => announceMeetupChange(3))

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps the newest result when reload responses arrive out of order (SCRUM-151)', async () => {
    const first = deferred<Response>()
    const second = deferred<Response>()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(Response.json([meetup]))
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    vi.stubGlobal('fetch', fetch)
    const container = await render(paula)

    act(() => {
      announceMeetupChange(3)
      announceMeetupChange(3)
    })
    await act(async () => second.resolve(Response.json([{ ...meetup, id: 22, host: { ...meetup.host!, nickname: 'Neu' } }])))
    await act(async () => first.resolve(Response.json([{ ...meetup, id: 21, host: { ...meetup.host!, nickname: 'Alt' } }])))

    expect(container.textContent).toContain('Neu')
    expect(container.textContent).not.toContain('Alt')
  })

  it('distinguishes the initial loading and error states from an empty list (SCRUM-151)', async () => {
    const pending = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => pending.promise))
    const container = renderPending(paula)

    expect(container.textContent).toContain('Treffen werden geladen')
    expect(container.textContent).not.toContain('Gerade ist niemand hier')

    pending.reject(new Error('Netz kaputt'))
    await act(async () => {})
    expect(container.textContent).toContain('Netz kaputt')
    expect(container.textContent).not.toContain('Gerade ist niemand hier')
  })

  it('loads again when the page comes back to the front (SCRUM-78)', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(Response.json([meetup])))
    vi.stubGlobal('fetch', fetch)
    await render(paula)
    expect(fetch).toHaveBeenCalledTimes(1)

    // jsdom says "prerender"; a real page in front says "visible".
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('lists the active Meetups with Host and people', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([meetup])))

    const text = (await render(paula)).textContent

    expect(text).toContain('LIVE')
    expect(text).toContain('Paula')
    expect(text).toContain('3 Personen')
    expect(document.getElementById('treffen-7')).not.toBeNull()
  })

  it('shows "Jetzt beenden" only to the Host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([meetup])))
    expect(button(await render(paula), 'Jetzt beenden')).toBeDefined()

    document.body.innerHTML = ''
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([asOther(meetup)])))
    const other = { ...paula, id: 2, nickname: 'Karl' }
    expect(button(await render(other), 'Jetzt beenden')).toBeUndefined()
  })

  it('asks a guest to log in before "Ich bin jetzt hier"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))
    const onLoginNeeded = vi.fn()
    const container = await render(null, onLoginNeeded)

    act(() => button(container, 'Ich bin jetzt hier')!.click())

    expect(onLoginNeeded).toHaveBeenCalledOnce()
  })

  it('offers 1 to 4 hours, 2 chosen, and a Party size from 1 to 10', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([])))
    const container = await render(paula)

    act(() => button(container, 'Ich bin jetzt hier')!.click())

    const hours = [...container.querySelectorAll('.segments button')]
    expect(hours.map((b) => b.textContent)).toEqual(['1 h', '2 h', '3 h', '4 h'])
    expect(hours.find((b) => b.getAttribute('aria-pressed') === 'true')?.textContent).toBe('2 h')
    expect(button(container, '−')!.disabled).toBe(true)
    for (let i = 0; i < 12; i++) act(() => button(container, '+')!.click())
    expect(container.querySelector('output')!.textContent).toBe('10')
    expect(button(container, '+')!.disabled).toBe(true)
  })

  it('shows a later Meetup with its date and time, not as LIVE', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([laterMeetup])))

    const text = (await render(null)).textContent

    expect(text).not.toContain('LIVE')
    expect(text).toMatch(/\d\d\.\d\d\., \d\d:\d\d–\d\d:\d\d Uhr/)
  })

  it('offers the Host "Zeit ändern" for a later Meetup, not "Jetzt beenden"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([laterMeetup])))
    const container = await render(paula)

    expect(button(container, 'Zeit ändern')).toBeDefined()
    expect(button(container, 'Jetzt beenden')).toBeUndefined()
  })

  it('plans a later Meetup with the chosen start time', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Response.json(laterMeetup, { status: 201 }) : Response.json([]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(paula)

    act(() => button(container, 'Später treffen')!.click())
    const field = container.querySelector<HTMLInputElement>('input[type="datetime-local"]')!
    expect(field.value).not.toBe('')
    await act(async () => button(container, 'Treffen planen')!.click())

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    const body = JSON.parse(post[1]!.body as string)
    expect(new Date(body.starts_at).getTime()).toBe(new Date(field.value).getTime())
    expect(body).toMatchObject({ place_id: 3, hours: 2, party_size: 1 })
  })

  it('submits a creation form only once when two submit events arrive together (SCRUM-149)', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const pending = deferred<Response>()
    const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? pending.promise : Promise.resolve(Response.json([])),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(paula)
    act(() => button(container, 'Ich bin jetzt hier')!.click())
    const form = container.querySelector<HTMLFormElement>('.now-form')!

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1)
    await act(async () => pending.resolve(Response.json(meetup, { status: 201 })))
  })

  it('lets the Host move the start of a later Meetup', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'PATCH' ? Response.json(laterMeetup) : Response.json([laterMeetup]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(paula)

    act(() => button(container, 'Zeit ändern')!.click())
    await act(async () => button(container, 'Speichern')!.click())

    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH')!
    expect(patch[0]).toBe('/api/meetups/8')
    expect(new Date(JSON.parse(patch[1]!.body as string).starts_at).getTime()).toBe(
      new Date(laterMeetup.starts_at).setSeconds(0, 0),
    )
  })

  it('shows a guest only the number of people, no Nicknames', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([guestView])))

    const text = (await render(null)).textContent

    expect(text).toContain('3 Personen')
    expect(text).not.toContain('Paula')
  })

  it('lists who joined, with their Party size', async () => {
    const withKarl = { ...meetup, people: 5, participants: [{ id: 2, nickname: 'Korb_Karl', avatar: 'bear', party_size: 2 }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([withKarl])))

    const text = (await render(paula)).textContent

    expect(text).toContain('Korb_Karl (2)')
    expect(text).toContain('5 Personen')
  })

  it('asks a guest to log in before "Ich komme mit"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([guestView])))
    const onLoginNeeded = vi.fn()
    const container = await render(null, onLoginNeeded)

    act(() => button(container, 'Ich komme mit')!.click())

    expect(onLoginNeeded).toHaveBeenCalledOnce()
  })

  it('lets another user join with a Party size', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Response.json(asJoined(meetup), { status: 201 }) : Response.json([asOther(meetup)]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(karl)

    expect(button(container, 'Jetzt beenden')).toBeUndefined()
    act(() => button(container, 'Ich komme mit')!.click())
    act(() => button(container, '+')!.click())
    await act(async () => button(container, 'Beitreten')!.click())

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(post[0]).toBe('/api/meetups/7/join')
    expect(JSON.parse(post[1]!.body as string)).toEqual({ party_size: 2 })
  })

  it('shows the message when the user is already in 2 Meetups at that time (SCRUM-80)', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const full = 'Du bist zu dieser Zeit schon bei 2 Treffen.'
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === 'POST' ? Response.json({ detail: full }, { status: 409 }) : Response.json([asOther(meetup)]),
      ),
    )
    const container = await render(karl)

    act(() => button(container, 'Ich komme mit')!.click())
    await act(async () => button(container, 'Beitreten')!.click())

    expect(container.querySelector('.form-error')?.textContent).toBe(full)
  })

  it('shows "Verlassen" to a user who joined, and leaves', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const withKarl = asJoined({ ...meetup, participants: [{ id: 2, nickname: 'Korb_Karl', avatar: 'bear', party_size: 1 }] })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json([withKarl]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(karl)

    expect(button(container, 'Ich komme mit')).toBeUndefined()
    await act(async () => button(container, 'Verlassen')!.click())

    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/meetups/7/join' && init?.method === 'DELETE')).toBe(true)
  })

  it('does not offer the Host "Ich komme mit"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([meetup])))

    expect(button(await render(paula), 'Ich komme mit')).toBeUndefined()
  })

  it('offers the Host of a later Meetup "Absagen", "Verlassen" and "Zeit ändern"', async () => {
    const joinedLater = { ...laterMeetup, participants: [{ id: 2, nickname: 'Korb_Karl', avatar: 'bear', party_size: 1 }] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([joinedLater])))
    const container = await render(paula)

    for (const text of ['Absagen', 'Verlassen', 'Zeit ändern']) expect(button(container, text)).toBeDefined()
    act(() => button(container, 'Zeit ändern')!.click())
    expect(container.textContent).toContain('Die anderen werden gefragt, ob sie zur neuen oder zur alten Zeit dabei sind.')
  })

  it('offers the Host of a running Meetup "Jetzt beenden" and "Verlassen", not "Absagen"', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([meetup])))
    const container = await render(paula)

    expect(button(container, 'Jetzt beenden')).toBeDefined()
    expect(button(container, 'Verlassen')).toBeDefined()
    expect(button(container, 'Absagen')).toBeUndefined()
  })

  it('shows a cancelled Meetup as "Abgesagt", without actions', async () => {
    const cancelled = { ...laterMeetup, cancelled: true, state: 'cancelled', actions: [] }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([cancelled])))
    const container = await render(karl)

    expect(container.textContent).toContain('Abgesagt')
    expect(button(container, 'Ich komme mit')).toBeUndefined()
  })

  it('asks a user who was in after the Host moved it, and sends the answer', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const offered = asJoined({
      ...laterMeetup,
      move_offer: { meetup_id: 9, host: { id: 1, nickname: 'Paula', avatar: 'fox' }, starts_at: hoursFromNow(25), ends_at: hoursFromNow(27) },
    })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Response.json(laterMeetup) : Response.json([offered]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(karl)

    const newStart = startChoice(offered.move_offer!.starts_at, offered.starts_at)
    const oldStart = startChoice(offered.starts_at, offered.move_offer!.starts_at)
    expect(container.textContent).toContain(`Paula hat das Treffen auf ${newStart} verlegt. Wann bist du dabei?`)
    for (const text of [newStart, oldStart, 'Gar nicht']) expect(button(container, text)).toBeDefined()
    await act(async () => button(container, oldStart)!.click())

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(post[0]).toBe('/api/meetups/8/move-answer')
    expect(JSON.parse(post[1]!.body as string)).toEqual({ answer: 'stay' })
  })

  it('hides "Verlassen" and the new Meetup\'s "Ich komme mit" while the move answer is open (SCRUM-97)', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const moved = asOther({ ...laterMeetup, id: 9, starts_at: hoursFromNow(25), ends_at: hoursFromNow(27) })
    const offered = asJoined({
      ...laterMeetup,
      move_offer: { meetup_id: 9, host: { id: 1, nickname: 'Paula', avatar: 'fox' }, starts_at: moved.starts_at, ends_at: moved.ends_at },
    })
    let answered = false
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        answered = true
        return Response.json(laterMeetup)
      }
      return Response.json(answered ? [asJoined(laterMeetup), moved] : [offered, moved])
    })
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(karl)
    const card = (id: number) => container.querySelector<HTMLElement>(`#treffen-${id}`)!

    expect(button(card(8), 'Gar nicht')).toBeDefined()
    expect(button(card(8), 'Verlassen')).toBeUndefined()
    expect(button(card(9), 'Ich komme mit')).toBeUndefined()

    await act(async () => button(card(8), 'Gar nicht')!.click())

    expect(button(card(8), 'Verlassen')).toBeDefined()
    expect(button(card(9), 'Ich komme mit')).toBeDefined()
  })

  it('asks a participant as a Contact after a tap on the Nickname (SCRUM-32)', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const withMia = asOther({ ...meetup, participants: [{ id: 3, nickname: 'Mia_Matte', avatar: 'fox', party_size: 1 }] })
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' && url === '/api/contacts/requests'
        ? Response.json({ id: 1, user: { id: 3, nickname: 'Mia_Matte', avatar: 'fox' }, status: 'pending' }, { status: 201 })
        : Response.json([withMia]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(karl)

    act(() => button(container, 'Mia_Matte')!.click())
    await act(async () => button(container, 'Als Kontakt anfragen')!.click())

    const post = fetchMock.mock.calls.find(([url]) => url === '/api/contacts/requests')!
    expect(JSON.parse(post[1]!.body as string)).toEqual({ nickname: 'Mia_Matte' })
    expect(container.textContent).toContain('Kontaktanfrage an Mia_Matte gesendet')
  })

  it('warns when someone the user blocked is in the Meetup (SCRUM-32)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ ...meetup, blocked_user_in: true }])))

    expect((await render(paula)).textContent).toContain('Jemand, den du blockiert hast, ist dabei')
  })

  it('plans a weekly Series with a time and duration per weekday (SCRUM-38)', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      init?.method === 'POST' && url === '/api/meetup-series' ? Response.json({ id: 5 }, { status: 201 }) : Response.json([]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(paula)

    act(() => button(container, 'Später treffen')!.click())
    act(() => container.querySelector<HTMLInputElement>('label.checkbox input')!.click())
    expect(button(container, 'Serie anlegen')!.disabled).toBe(true)
    const monday = [...container.querySelectorAll<HTMLInputElement>('.series-slot input[type="checkbox"]')][0]
    act(() => monday.click())
    await act(async () => button(container, 'Serie anlegen')!.click())

    const post = fetchMock.mock.calls.find(([url]) => url === '/api/meetup-series')!
    expect(JSON.parse(post[1]!.body as string)).toEqual({
      place_id: 3,
      slots: [{ weekday: 0, time: '19:00', hours: 2 }],
      party_size: 1,
      until: null,
    })
  })

  it('shows the next date of a Series and the others in "Alle Termine"', async () => {
    const occurrence = (id: number, h: number) =>
      asOther({ ...laterMeetup, id, series_id: 9, starts_at: hoursFromNow(h), ends_at: hoursFromNow(h + 2) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([occurrence(20, 24), occurrence(21, 24 * 8), occurrence(22, 24 * 15)])))
    const container = await render(karl)

    expect(container.querySelectorAll('.meetup-card')).toHaveLength(1)
    act(() => button(container, 'Alle Termine (3)')!.click())

    expect(container.querySelectorAll('.meetup-card')).toHaveLength(3)
    expect(container.querySelectorAll('.series-tag')).toHaveLength(3)
    // Each date has its own Join.
    expect([...container.querySelectorAll('button')].filter((b) => b.textContent === 'Ich komme mit')).toHaveLength(3)
  })

  it('lets the Host of a Series cancel it', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const occurrence = (id: number, h: number) => ({
      ...laterMeetup,
      id,
      series_id: 9,
      actions: [...laterMeetup.actions, 'cancel_series'],
      starts_at: hoursFromNow(h),
      ends_at: hoursFromNow(h + 2),
    })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Response.json({ id: 9 }) : Response.json([occurrence(20, 24), occurrence(21, 24 * 8)]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(paula)

    await act(async () => button(container, 'Serie absagen')!.click())

    expect(fetchMock.mock.calls.some(([url, init]) => url === '/api/meetup-series/9/cancel' && init?.method === 'POST')).toBe(true)
  })

  it('keeps Series cancellation on the overview after the first occurrence changed Host (SCRUM-150)', async () => {
    localStorage.setItem('squadmeet.token', 'tok')
    const handed = {
      ...laterMeetup,
      id: 20,
      series_id: 9,
      host: { id: 2, nickname: 'Korb_Karl', avatar: 'bear' },
      actions: ['cancel', 'move', 'leave'],
      starts_at: hoursFromNow(24),
      ends_at: hoursFromNow(26),
    }
    const owned = {
      ...laterMeetup,
      id: 21,
      series_id: 9,
      actions: [...laterMeetup.actions, 'cancel_series'],
      starts_at: hoursFromNow(24 * 8),
      ends_at: hoursFromNow(24 * 8 + 2),
    }
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Response.json({ id: 9 }) : Response.json([handed, owned]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(paula)

    await act(async () => button(container, 'Serie absagen')!.click())

    expect(fetchMock.mock.calls.some(([url]) => url === '/api/meetup-series/9/cancel')).toBe(true)
  })

  it('does not scroll a Meetup deep link again after a reload (SCRUM-155)', async () => {
    window.location.hash = '#treffen-7'
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([meetup])))
    await render(paula)

    await act(async () => announceMeetupChange(3))

    expect(scrollIntoView).toHaveBeenCalledOnce()
    delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView
  })
})
