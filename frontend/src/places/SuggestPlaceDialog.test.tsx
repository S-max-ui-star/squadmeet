import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SuggestPlaceDialog from './SuggestPlaceDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const here = { coords: { latitude: 51.3, longitude: 12.3, accuracy: 8 } }
const created = { id: 99, name: 'Tischtennisplatte', activity_type: 'table_tennis', lat: 51.3, lon: 12.3, people_now: 0, is_suggestion: true, confirmations: 1 }
const nearby = { ...created, id: 5, name: 'Platte am Teich', is_suggestion: false, confirmations: 0, distance_m: 12 }

beforeEach(() => {
  vi.stubGlobal('navigator', {
    geolocation: { getCurrentPosition: (ok: (p: typeof here) => void) => ok(here) },
  })
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function render(props: Partial<Parameters<typeof SuggestPlaceDialog>[0]> = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const all = { token: 't', onCreated: vi.fn(), onOpenPlace: vi.fn(), onClose: vi.fn(), ...props }
  await act(async () => createRoot(container).render(<SuggestPlaceDialog {...all} />))
  return { container, ...all }
}

function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))!
}

async function chooseTableTennisAndGoOn(container: HTMLElement) {
  act(() => button(container, 'Tischtennis').click())
  await act(async () => button(container, 'Weiter').click())
}

describe('SuggestPlaceDialog', () => {
  it('saves at once when no Place of the type is near', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json([]))
      .mockResolvedValueOnce(Response.json(created, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    const { container, onCreated } = await render()

    await chooseTableTennisAndGoOn(container)

    expect(fetchMock.mock.calls[0][0]).toBe('/api/place-suggestions/nearby?lat=51.3&lon=12.3&activity_type=table_tennis')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ activity_type: 'table_tennis', lat: 51.3, lon: 12.3, name: '' })
    expect(onCreated).toHaveBeenCalledWith(created)
  })

  it('shows Places nearby and opens the one the user picks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json([nearby])))
    const { container, onOpenPlace, onCreated } = await render()

    await chooseTableTennisAndGoOn(container)

    expect(container.textContent).toContain('Ist es einer davon?')
    expect(container.textContent).toContain('12 m entfernt')
    act(() => button(container, 'Platte am Teich').click())
    expect(onOpenPlace).toHaveBeenCalledWith(5)
    expect(onCreated).not.toHaveBeenCalled()
  })

  it('still saves a new Place after the warning', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(Response.json([nearby])).mockResolvedValueOnce(Response.json(created, { status: 201 })),
    )
    const { container, onCreated } = await render()
    await chooseTableTennisAndGoOn(container)

    await act(async () => button(container, 'Nein, neuer Platz').click())

    expect(onCreated).toHaveBeenCalledWith(created)
  })

  it('has no legal links: only login, registration and Konto show them (SCRUM-174)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json([nearby])))
    const { container } = await render()
    expect(container.querySelector('nav[aria-label="Rechtliches"]')).toBeNull()

    await chooseTableTennisAndGoOn(container)

    expect(container.textContent).toContain('Ist es einer davon?')
    expect(container.querySelector('nav[aria-label="Rechtliches"]')).toBeNull()
  })

  it('cannot go on without an Activity type', async () => {
    const { container } = await render()

    expect(button(container, 'Weiter').disabled).toBe(true)
  })

  it('says so when the browser gives no location', async () => {
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (_ok: unknown, fail: () => void) => fail() },
    })
    const { container } = await render()

    expect(container.textContent).toContain('Kein Standort')
    expect(button(container, 'Weiter').disabled).toBe(true)
  })
})
