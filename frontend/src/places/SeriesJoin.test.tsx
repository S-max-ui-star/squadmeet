import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveToken } from '../api/auth'
import type { Meetup } from '../api/meetups'
import { slot } from './meetupTime'
import SeriesJoin from './SeriesJoin'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const daysFromNow = (d: number, h = 0) => new Date(Date.now() + (d * 24 + h) * 3_600_000).toISOString()

// Three dates of one Series, as Karl sees them: in the first, not yet in the others.
const date = (id: number, day: number, actions: string[]) =>
  ({
    id,
    place_id: 3,
    host: { id: 1, nickname: 'Paula', avatar: 'fox' },
    party_size: 1,
    people: 1,
    participants: [],
    contacts: [],
    cancelled: false,
    blocked_user_in: false,
    series_id: 5,
    state: 'upcoming',
    actions,
    move_offer: null,
    starts_at: daysFromNow(day),
    ends_at: daysFromNow(day, 2),
  }) as unknown as Meetup
const dates = [date(10, 1, ['leave', 'invite']), date(11, 8, ['join']), date(12, 15, ['join'])]

const roots: Root[] = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
})

// Answers each Join with 201, or with the given error for one Meetup id.
function server(failing?: { id: number; detail: string }) {
  return vi.fn(async (url: string, _init?: RequestInit) =>
    failing && url === `/api/meetups/${failing.id}/join`
      ? Response.json({ detail: failing.detail }, { status: 409 })
      : Response.json({}, { status: 201 }),
  )
}

async function render(onDone = () => {}) {
  saveToken('t')
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<SeriesJoin dates={dates} onDone={onDone} />))
  return container
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)
const box = (container: HTMLElement, meetup: Meetup) =>
  container.querySelector<HTMLInputElement>(`input[type="checkbox"][value="${meetup.id}"]`)!
const joined = (fetch: ReturnType<typeof server>) =>
  fetch.mock.calls.map(([url, init]) => [url, JSON.parse(init!.body as string).party_size])

describe('SeriesJoin (SCRUM-81)', () => {
  it('ticks and locks the dates the user is already in', async () => {
    const container = await render()

    expect(box(container, dates[0]).checked).toBe(true)
    expect(box(container, dates[0]).disabled).toBe(true)
    expect(box(container, dates[1]).checked).toBe(false)
    expect(box(container, dates[1]).disabled).toBe(false)
    expect(container.textContent).toContain(slot(dates[2]))
  })

  it('joins only the ticked dates, with one Party size', async () => {
    const fetch = server()
    vi.stubGlobal('fetch', fetch)
    const onDone = vi.fn()
    const container = await render(onDone)

    await act(async () => box(container, dates[2]).click())
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Eine Person mehr"]')!.click())
    await act(async () => button(container, 'Ausgewählten beitreten')!.click())

    expect(joined(fetch)).toEqual([['/api/meetups/12/join', 2]])
    expect(onDone).toHaveBeenCalledOnce()
  })

  it('"Ausgewählten beitreten" waits for a ticked date', async () => {
    const container = await render()

    expect(button(container, 'Ausgewählten beitreten')!.disabled).toBe(true)
  })

  it('"Allen beitreten" joins every date the user is not in yet', async () => {
    const fetch = server()
    vi.stubGlobal('fetch', fetch)
    const container = await render()

    await act(async () => button(container, 'Allen beitreten')!.click())

    expect(joined(fetch)).toEqual([
      ['/api/meetups/11/join', 1],
      ['/api/meetups/12/join', 1],
    ])
  })

  it('goes on after a date that fails and names it', async () => {
    const fetch = server({ id: 11, detail: 'Du bist zu dieser Zeit schon in 2 Treffen.' })
    vi.stubGlobal('fetch', fetch)
    const container = await render()

    await act(async () => button(container, 'Allen beitreten')!.click())

    expect(joined(fetch).map(([url]) => url)).toEqual(['/api/meetups/11/join', '/api/meetups/12/join'])
    expect(container.textContent).toContain('Beigetreten: 1 Termin.')
    expect(container.textContent).toContain(`${slot(dates[1])}: Du bist zu dieser Zeit schon in 2 Treffen.`)
  })
})
