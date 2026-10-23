import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Meetup } from '../api/meetups'
import type { Place } from '../api/places'
import MeetupMap from './MeetupMap'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const place: Place = {
  id: 3,
  name: 'Korb im Park',
  activity_type: 'basketball',
  lat: 51.33,
  lon: 12.36,
  people_now: 2,
  is_suggestion: false,
  confirmations: 0,
}
const meetup: Meetup = {
  id: 7,
  place_id: 3,
  host: null,
  party_size: 2,
  people: 2,
  participants: null,
  contacts: null,
  equipment: [],
  equipment_by_person: null,
  starts_at: '2026-10-14T16:00:00Z',
  ends_at: '2026-10-14T18:00:00Z',
  cancelled: false,
  move_offer: null,
  blocked_user_in: false,
  series_id: null,
  state: 'live',
  actions: ['join'],
}

afterEach(() => {
  document.body.innerHTML = ''
})

function render(
  span: 'now' | '3h' | '6h' | 'today' | null = null,
  meetups: Meetup[] = span ? [meetup] : [],
  state: { loading?: boolean; error?: boolean } = {},
) {
  const container = document.createElement('div')
  document.body.append(container)
  const onSpanChange = vi.fn()
  const onOpenPlace = vi.fn()
  act(() =>
    createRoot(container).render(
      <MeetupMap
        span={span}
        meetups={meetups}
        places={span ? [place] : []}
        onSpanChange={onSpanChange}
        onOpenPlace={onOpenPlace}
        {...state}
      />,
    ),
  )
  return { container, onSpanChange, onOpenPlace }
}

describe('MeetupMap', () => {
  it('offers the four Time filters and switches a selected one off', () => {
    const { container, onSpanChange } = render('3h')
    const buttons = [...container.querySelectorAll('.time-filter button')]

    expect(buttons.map((button) => button.textContent)).toEqual(['Jetzt', '3 h', '6 h', 'Heute'])
    expect(buttons[1].getAttribute('aria-pressed')).toBe('true')
    act(() => (buttons[1] as HTMLButtonElement).click())
    expect(onSpanChange).toHaveBeenCalledWith(null)
  })

  it('lists matching Meetups and opens their Place', () => {
    const { container, onOpenPlace } = render('today')

    expect(container.textContent).toContain('Korb im Park')
    expect(container.textContent).toContain('2 Personen')
    act(() => (container.querySelector('.map-meetup-list button') as HTMLButtonElement).click())
    expect(onOpenPlace).toHaveBeenCalledWith(3)
  })

  it('does not show a Meetup list while the Time filter is off', () => {
    expect(render().container.querySelector('.map-meetup-list')).toBeNull()
  })

  it('does not report an empty result while the selected filter is loading or failed', () => {
    const loading = render('now', [], { loading: true }).container
    expect(loading.textContent).toContain('Treffen werden geladen')
    expect(loading.textContent).not.toContain('Keine Treffen')

    const failed = render('now', [], { error: true }).container
    expect(failed.textContent).toContain('Treffen konnten nicht geladen werden')
    expect(failed.textContent).not.toContain('Keine Treffen')
  })

  it('shows a participating Contact with avatar and Nickname', () => {
    const withContact = {
      ...meetup,
      contacts: [{ id: 2, nickname: 'Korb_Karl', avatar: 'bear' }],
    }

    const { container } = render('now', [withContact])

    expect(container.querySelector('.map-meetup-contacts')?.textContent).toBe('🐻 Korb_Karl ist dabei')
  })

  it('summarizes more than two participating Contacts', () => {
    const withContacts = {
      ...meetup,
      contacts: [
        { id: 2, nickname: 'Korb_Karl', avatar: 'bear' },
        { id: 3, nickname: 'Mia_Matte', avatar: 'cat' },
        { id: 4, nickname: 'Netz_Nora', avatar: 'owl' },
      ],
    }

    const { container } = render('now', [withContacts])

    expect(container.querySelector('.map-meetup-contacts')?.textContent).toBe('🐻 Korb_Karl und 2 weitere')
  })
})
