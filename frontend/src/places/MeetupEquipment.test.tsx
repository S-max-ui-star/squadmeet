import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/auth'
import type { Meetup } from '../api/meetups'
import PlaceMeetups from './PlaceMeetups'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// SCRUM-170: the Equipment section of the create, Join and change forms, and the Meetup card,
// at a table tennis Place.

const paula: User = { id: 1, nickname: 'Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }
const karl: User = { ...paula, id: 2, nickname: 'Korb_Karl', avatar: 'bear' }
const hoursFromNow = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString()

// Running now, Paula hosts it with 2 Schläger, Karl joined with Bälle; as Paula sees it.
const meetup: Meetup = {
  id: 7,
  place_id: 3,
  host: { id: 1, nickname: 'Paula', avatar: 'fox' },
  party_size: 1,
  people: 2,
  participants: [{ id: 2, nickname: 'Korb_Karl', avatar: 'bear', party_size: 1 }],
  contacts: [],
  equipment: [{ item: 'rackets', count: 2 }, { item: 'balls', count: 1 }],
  equipment_by_person: [
    { id: 1, nickname: 'Paula', avatar: 'fox', items: [{ item: 'rackets', count: 2 }] },
    { id: 2, nickname: 'Korb_Karl', avatar: 'bear', items: [{ item: 'balls', count: 1 }] },
  ],
  cancelled: false,
  move_offer: null,
  blocked_user_in: false,
  series_id: null,
  state: 'live',
  actions: ['end', 'leave', 'invite', 'equipment'],
  starts_at: hoursFromNow(-1),
  ends_at: hoursFromNow(1),
}
const bare: Meetup = { ...meetup, participants: [], people: 1, equipment: [], equipment_by_person: [] }

const roots: Root[] = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  localStorage.clear()
})

// GET answers with `listed`; every other request with `meetup`. Returns the fetch mock.
function serve(listed: Meetup[]) {
  localStorage.setItem('squadmeet.token', 'tok')
  const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    init?.method ? Response.json(meetup, { status: 201 }) : Response.json(listed),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function render(user: User | null) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () =>
    root.render(
      <PlaceMeetups placeId={3} activityType="table_tennis" user={user} onLoginNeeded={() => {}} onChanged={() => {}} />,
    ),
  )
  return container
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))
const labelled = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
const sent = (fetchMock: ReturnType<typeof serve>, method: string) => {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method)!
  return [call[0], JSON.parse(call[1]!.body as string)]
}

describe('Equipment (SCRUM-170)', () => {
  it('keeps the section closed in the Join form; joining without it sends no Equipment', async () => {
    const fetchMock = serve([{ ...bare, actions: ['join'] }])
    const container = await render(karl)

    act(() => button(container, 'Ich komme mit')!.click())
    const toggle = button(container, 'Ausrüstung (freiwillig)')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('Schläger')
    await act(async () => button(container, 'Beitreten')!.click())

    expect(sent(fetchMock, 'POST')).toEqual(['/api/meetups/7/join', { party_size: 1 }])
  })

  it('joins with 2 Schläger and Bälle', async () => {
    const fetchMock = serve([{ ...bare, actions: ['join'] }])
    const container = await render(karl)

    act(() => button(container, 'Ich komme mit')!.click())
    act(() => button(container, 'Ausrüstung (freiwillig)')!.click())
    // Only the items of a table tennis Place.
    expect(container.querySelectorAll('.equipment-row')).toHaveLength(3)
    act(() => labelled(container, 'Bälle: bringe ich mit').click())
    act(() => labelled(container, 'Schläger: bringe ich mit').click())
    act(() => labelled(container, 'Schläger: mehr').click())
    await act(async () => button(container, 'Beitreten')!.click())

    expect(sent(fetchMock, 'POST')[1]).toEqual({
      party_size: 1,
      equipment: [{ item: 'rackets', count: 2 }, { item: 'balls', count: 1 }],
    })
  })

  it('allows 1–4 Schläger and "–" takes an item back', async () => {
    serve([{ ...bare, actions: ['join'] }])
    const container = await render(karl)
    act(() => button(container, 'Ich komme mit')!.click())
    act(() => button(container, 'Ausrüstung (freiwillig)')!.click())

    act(() => labelled(container, 'Schläger: bringe ich mit').click())
    expect(labelled(container, 'Schläger: weniger').disabled).toBe(true)
    for (let n = 0; n < 3; n++) act(() => labelled(container, 'Schläger: mehr').click())
    expect(labelled(container, 'Schläger: bringe ich mit').textContent).toBe('Bringe 4')
    expect(labelled(container, 'Schläger: mehr').disabled).toBe(true)

    act(() => labelled(container, 'Schläger: nicht dabei').click())
    expect(labelled(container, 'Schläger: nicht dabei').getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelector('button[aria-label="Schläger: mehr"]')).toBeNull()
  })

  it('creates a Meetup with Equipment', async () => {
    const fetchMock = serve([])
    const container = await render(paula)

    act(() => button(container, 'Ich bin jetzt hier')!.click())
    expect(button(container, 'Ausrüstung (freiwillig)')!.getAttribute('aria-expanded')).toBe('false')
    act(() => button(container, 'Ausrüstung (freiwillig)')!.click())
    act(() => labelled(container, 'Netz: bringe ich mit').click())
    await act(async () => button(container, 'Jetzt auf die Karte')!.click())

    expect(sent(fetchMock, 'POST')[1]).toMatchObject({ party_size: 1, equipment: [{ item: 'net', count: 1 }] })
  })

  it('offers no Equipment for a weekly Series', async () => {
    serve([])
    const container = await render(paula)

    act(() => button(container, 'Später treffen')!.click())
    act(() => container.querySelector<HTMLInputElement>('.checkbox input')!.click())

    expect(button(container, 'Ausrüstung (freiwillig)')).toBeUndefined()
  })

  it('shows one summary line and who brings what, closed by default', async () => {
    serve([meetup])
    const container = await render(paula)

    expect(container.querySelector('.equipment-line')!.textContent).toBe('Mitgebracht: 🏓 2 Schläger · ⚪ Bälle')
    const toggle = button(container, 'Ausrüstung ▸')!
    expect(container.querySelector('.equipment-people')).toBeNull()

    act(() => toggle.click())

    const people = [...container.querySelectorAll('.equipment-people li')].map((li) => li.textContent)
    expect(people).toEqual(['🦊 du: 🏓 2 Schläger', '🐻 Korb_Karl: ⚪ Bälle'])
  })

  it('shows a guest the summary line only', async () => {
    serve([{ ...meetup, host: null, participants: null, equipment_by_person: null, actions: ['join'] }])
    const container = await render(null)

    expect(container.querySelector('.equipment-line')!.textContent).toContain('2 Schläger')
    expect(button(container, 'Ausrüstung ▸')).toBeUndefined()
    expect(button(container, 'Ausrüstung ändern')).toBeUndefined()
  })

  it('changes the own Equipment, starting from what the user brings', async () => {
    const fetchMock = serve([meetup])
    const container = await render(paula)

    act(() => button(container, 'Ausrüstung ändern')!.click())
    // Opened at once, with Paula's 2 Schläger.
    expect(labelled(container, 'Schläger: bringe ich mit').textContent).toBe('Bringe 2')
    act(() => labelled(container, 'Schläger: weniger').click())
    await act(async () => button(container, 'Speichern')!.click())

    expect(sent(fetchMock, 'PUT')).toEqual(['/api/meetups/7/equipment', { equipment: [{ item: 'rackets', count: 1 }] }])
    expect(button(container, 'Speichern')).toBeUndefined()
  })

  it('offers "Ausrüstung ändern" only where the server allows it', async () => {
    serve([{ ...meetup, actions: ['join'] }])
    const container = await render(karl)

    expect(button(container, 'Ausrüstung ändern')).toBeUndefined()
  })
})
