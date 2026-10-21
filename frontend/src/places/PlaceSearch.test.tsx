import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as placesApi from '../api/places'
import PlaceSearch from './PlaceSearch'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots = new Set<ReturnType<typeof createRoot>>()

afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.clear()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function render(onPick = vi.fn(), dismissRequest = 0) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  act(() => root.render(<PlaceSearch onPick={onPick} dismissRequest={dismissRequest} />))
  return {
    container,
    onPick,
    rerender: (nextDismissRequest: number) => {
      act(() => root.render(<PlaceSearch onPick={onPick} dismissRequest={nextDismissRequest} />))
    },
  }
}

function enter(container: HTMLElement, query: string) {
  const input = container.querySelector('input')!
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  act(() => {
    setter.call(input, query)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function search(container: HTMLElement, query: string) {
  enter(container, query)
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('PlaceSearch', () => {
  it('searches only when the form is submitted and reports no hit', async () => {
    const request = vi.spyOn(placesApi, 'searchPlaces').mockResolvedValue([])
    const { container } = render()

    expect(request).not.toHaveBeenCalled()
    await search(container, 'Unbekannt')

    expect(request).toHaveBeenCalledWith('Unbekannt', expect.any(AbortSignal))
    expect(container.textContent).toContain('Keine Treffer')
  })

  it('allows only one request while a search is pending', async () => {
    let finish!: (hits: placesApi.PlaceSearchHit[]) => void
    const request = vi.spyOn(placesApi, 'searchPlaces').mockImplementation(
      () => new Promise((resolve) => { finish = resolve }),
    )
    const { container } = render()
    enter(container, 'Park')
    const form = container.querySelector('form')!

    act(() => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })

    expect(request).toHaveBeenCalledTimes(1)
    expect(form.getAttribute('aria-busy')).toBe('true')
    await act(async () => finish([]))
    expect(form.getAttribute('aria-busy')).toBe('false')

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('passes a picked Place hit to the map', async () => {
    const hit = { kind: 'place' as const, label: 'Clara-Zetkin-Park', lat: 51.34, lon: 12.35, place_id: 7 }
    vi.spyOn(placesApi, 'searchPlaces').mockResolvedValue([hit])
    const { container, onPick } = render()
    await search(container, 'Zetkin')

    const hitButton = [...container.querySelectorAll('.search-results button')][0] as HTMLButtonElement
    act(() => hitButton.click())

    expect(onPick).toHaveBeenCalledWith(hit)
  })

  it('closes old results when the search input is cleared', async () => {
    vi.spyOn(placesApi, 'searchPlaces').mockResolvedValue([
      { kind: 'address', label: 'Clara-Zetkin-Park', lat: 51.34, lon: 12.35, place_id: null },
    ])
    const { container } = render()
    await search(container, 'Zetkin')

    enter(container, '')

    expect(container.querySelector('.search-results')).toBeNull()
  })

  it('closes results when the map requests dismissal', async () => {
    vi.spyOn(placesApi, 'searchPlaces').mockResolvedValue([
      { kind: 'address', label: 'Clara-Zetkin-Park', lat: 51.34, lon: 12.35, place_id: null },
    ])
    const { container, rerender } = render()
    await search(container, 'Zetkin')

    rerender(1)

    expect(container.querySelector('.search-results')).toBeNull()
  })
})
