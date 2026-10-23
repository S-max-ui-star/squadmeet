import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MyMeetup } from '../api/meetups'
import MyMeetupsDialog from './MyMeetupsDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function meetup(changes: Partial<MyMeetup>): MyMeetup {
  return {
    id: 1,
    place_id: 7,
    host: { id: 1, nickname: 'Pong_Paula', avatar: 'fox' },
    party_size: 1,
    people: 2,
    participants: [],
    contacts: [],
    equipment: [],
    equipment_by_person: [],
    equipment_needed: [],
    equipment_missing: [],
    starts_at: '2026-10-24T16:00:00Z',
    ends_at: '2026-10-24T18:00:00Z',
    cancelled: false,
    move_offer: null,
    blocked_user_in: false,
    series_id: null,
    state: 'upcoming',
    actions: [],
    place: { id: 7, name: 'Platte am Teich', activity_type: 'table_tennis' },
    hosting: true,
    ...changes,
  }
}

async function render(meetups: MyMeetup[], onOpenPlace = vi.fn()) {
  const fetchMock = vi.fn(async () => Response.json(meetups))
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () =>
    createRoot(container).render(<MyMeetupsDialog token="tok" onOpenPlace={onOpenPlace} onClose={() => {}} />),
  )
  return { container, fetchMock, onOpenPlace }
}

const sections = (container: HTMLElement) =>
  [...container.querySelectorAll('section')].map((section) => section.querySelector('h3')?.textContent)

describe('MyMeetupsDialog (SCRUM-102)', () => {
  it('loads the own Meetups with the login', async () => {
    const { fetchMock } = await render([])

    expect(fetchMock).toHaveBeenCalledWith('/api/meetups/mine', { headers: { Authorization: 'Bearer tok' } })
  })

  it('lists hosted and joined Meetups with time, Activity type, Place and people', async () => {
    const { container } = await render([
      meetup({ id: 1 }),
      meetup({ id: 2, hosting: false, place: { id: 9, name: 'Korb Nord', activity_type: 'basketball' } }),
    ])

    expect(sections(container)).toEqual(['Gastgeber', 'Dabei'])
    const [hosted, joined] = container.querySelectorAll('section')
    expect(hosted.textContent).toContain('Platte am Teich')
    expect(hosted.textContent).toContain('🏓')
    expect(hosted.textContent).toContain('Sa. 24.10.')
    expect(hosted.textContent).toContain('2 Personen')
    expect(joined.textContent).toContain('Korb Nord')
    expect(joined.textContent).toContain('🏀')
  })

  it('leaves out an empty section and says so when there is nothing', async () => {
    const one = await render([meetup({ hosting: false })])
    expect(sections(one.container)).toEqual(['Dabei'])

    document.body.innerHTML = ''
    const none = await render([])
    expect(none.container.textContent).toContain('Keine anstehenden Treffen')
  })

  it('marks a cancelled Meetup as "Abgesagt"', async () => {
    const { container } = await render([meetup({ cancelled: true, state: 'cancelled' })])

    expect(container.querySelector('section li')?.textContent).toContain('Abgesagt')
  })

  it('groups the dates of a Series', async () => {
    const { container } = await render([
      meetup({ id: 1, series_id: 5 }),
      meetup({ id: 2, series_id: 5, starts_at: '2026-10-31T16:00:00Z', ends_at: '2026-10-31T18:00:00Z' }),
      meetup({ id: 3, series_id: 5, starts_at: '2026-11-07T17:00:00Z', ends_at: '2026-11-07T19:00:00Z' }),
    ])

    const rows = container.querySelectorAll('section li')
    expect(rows).toHaveLength(1)
    expect(rows[0].textContent).toContain('+ 2 weitere Termine')
  })

  it('opens the Place on a tap', async () => {
    const { container, onOpenPlace } = await render([meetup({})])

    await act(async () => container.querySelector<HTMLButtonElement>('section li button')!.click())

    expect(onOpenPlace).toHaveBeenCalledWith(7)
  })
})
