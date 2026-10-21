import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveToken, type User } from '../api/auth'
import type { Place } from '../api/places'
import SuggestionStatus from './SuggestionStatus'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const paula: User = { id: 1, nickname: 'Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }
const suggestion: Place = {
  id: 7,
  name: 'Platte am Teich',
  activity_type: 'table_tennis',
  lat: 51.3,
  lon: 12.3,
  people_now: 0,
  is_suggestion: true,
  confirmations: 1,
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  localStorage.clear()
})

function at(latitude: number, longitude: number) {
  vi.stubGlobal('navigator', {
    geolocation: {
      getCurrentPosition: (ok: (p: unknown) => void) => ok({ coords: { latitude, longitude, accuracy: 5 } }),
    },
  })
}

async function render(props: Partial<Parameters<typeof SuggestionStatus>[0]> = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const all = { place: suggestion, user: paula, onLoginNeeded: vi.fn(), onConfirmed: vi.fn(), ...props }
  await act(async () => createRoot(container).render(<SuggestionStatus {...all} />))
  return { container, ...all }
}

const confirmButton = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('.confirm-button')!

describe('SuggestionStatus', () => {
  it('shows the Confirmations of a suggestion and the confirm button', async () => {
    const { container } = await render()

    expect(container.textContent).toContain('1 von 3 Bestätigungen')
    expect(confirmButton(container).textContent).toContain('Vor Ort bestätigen')
  })

  it('asks a guest to log in instead of confirming', async () => {
    const { container, onLoginNeeded } = await render({ user: null })

    await act(async () => confirmButton(container).click())

    expect(onLoginNeeded).toHaveBeenCalledOnce()
  })

  it('sends the position and passes the updated Place on', async () => {
    saveToken('tok')
    at(51.3001, 12.3001)
    const updated = { ...suggestion, confirmations: 2 }
    const fetchMock = vi.fn(async () => Response.json(updated))
    vi.stubGlobal('fetch', fetchMock)
    const { container, onConfirmed } = await render()

    await act(async () => confirmButton(container).click())

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/place-suggestions/7/confirm')
    expect(JSON.parse(String(init.body))).toEqual({ lat: 51.3001, lon: 12.3001 })
    expect(onConfirmed).toHaveBeenCalledWith(updated)
  })

  it('shows the server error, for example too far away', async () => {
    saveToken('tok')
    at(52, 13)
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ detail: 'Du bist zu weit weg' }, { status: 409 })))
    const { container, onConfirmed } = await render()

    await act(async () => confirmButton(container).click())

    expect(container.querySelector('.form-error')?.textContent).toContain('zu weit weg')
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('says that a suggestion with 3 Confirmations waits for an Admin', async () => {
    const { container } = await render({ place: { ...suggestion, confirmations: 3, waiting_for_admin: true } })

    expect(container.textContent).toContain('wartet auf Freigabe')
    expect(container.querySelector('.confirm-button')).toBeNull()
  })

  it('marks an approved Place as added by users, and shows nothing for an OSM Place', async () => {
    const approved = await render({ place: { ...suggestion, is_suggestion: false, confirmations: 3 } })
    expect(approved.container.textContent).toBe('Von Nutzern hinzugefügt')

    document.body.innerHTML = ''
    const osm = await render({ place: { ...suggestion, is_suggestion: false, confirmations: 0 } })
    expect(osm.container.textContent).toBe('')
  })
})
