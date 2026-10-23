import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import FavoritesDialog from './FavoritesDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const favorite = {
  id: 4,
  place: { id: 7, name: 'Tischtennisplatte', address: 'Clara-Zetkin-Park' },
  rules: [{ id: 9, weekdays: [0, 2], start: '17:00:00', end: '21:00:00' }],
}

async function render(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => createRoot(container).render(
    <FavoritesDialog token="tok" onOpenPlace={() => {}} onClose={() => {}} />,
  ))
  return container
}

describe('FavoritesDialog (SCRUM-41)', () => {
  it('lists the Place and its Time rule', async () => {
    const container = await render(vi.fn(async () => Response.json([favorite])))
    expect(container.textContent).toContain('Tischtennisplatte')
    expect(container.textContent).toContain('Mo, Mi, 17:00–21:00 Uhr')
    expect(container.textContent).not.toContain('Als Favorit merken')
  })

  it('says how to add a Favorite when there is none (SCRUM-178)', async () => {
    const container = await render(vi.fn(async () => Response.json([])))

    expect(container.textContent).toContain('Noch keine Favoriten gespeichert.')
    expect(container.textContent).toContain('Öffne einen Platz auf der Karte und tippe auf „☆ Als Favorit merken“.')
  })

  it('adds a same-day Time rule', async () => {
    const withoutRules = { ...favorite, rules: [] }
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json([withoutRules]))
      .mockResolvedValueOnce(Response.json({ id: 10, weekdays: [1], start: '17:00:00', end: '21:00:00' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json([favorite]))
    const container = await render(fetchMock)
    const add = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Zeitfenster'))!
    await act(async () => add.click())
    const tuesday = [...container.querySelectorAll('label')].find((label) => label.textContent?.includes('Di'))!
    await act(async () => (tuesday.querySelector('input') as HTMLInputElement).click())
    const save = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Speichern')!
    await act(async () => save.click())

    expect(fetchMock.mock.calls[1][0]).toBe('/api/favorites/4/rules')
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ weekdays: [1], start: '17:00', end: '21:00' })
  })
})
