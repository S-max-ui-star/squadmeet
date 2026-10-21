import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WaitingSuggestion } from '../api/admin'
import SuggestionApprovalDialog from './SuggestionApprovalDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function suggestion(changes: Partial<WaitingSuggestion> = {}): WaitingSuggestion {
  return {
    id: 7,
    name: 'Platte im Hof',
    activity_type: 'table_tennis',
    lat: 51.34,
    lon: 12.37,
    address: null,
    confirmations: 3,
    open_reports: 0,
    suggested_at: '2026-10-12T10:00:00Z',
    confirmed_at: '2026-10-13T10:00:00Z',
    approvable_from: '2026-10-13T10:00:00Z',
    approvable: true,
    osm_hints: [],
    ...changes,
  }
}

async function render(list: WaitingSuggestion[], ...more: Response[]) {
  const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(list)))
  for (const response of more) fetchMock.mockResolvedValueOnce(response)
  vi.stubGlobal('fetch', fetchMock)
  const onChanged = vi.fn()
  const onOpenPlace = vi.fn()
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () =>
    createRoot(container).render(
      <SuggestionApprovalDialog token="t" onChanged={onChanged} onOpenPlace={onOpenPlace} onClose={() => {}} />,
    ),
  )
  return { container, fetchMock, onChanged, onOpenPlace }
}

function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

describe('SuggestionApprovalDialog (SCRUM-56)', () => {
  it('shows the Confirmations and the OSM hint, and approves', async () => {
    const { container, fetchMock, onChanged } = await render(
      [suggestion({ osm_hints: ['building', 'residential'] })],
      new Response(null, { status: 204 }),
    )
    expect(container.textContent).toContain('Platte im Hof')
    expect(container.textContent).toContain('3 Bestätigungen')
    expect(container.textContent).toContain('OSM-Hinweis: Gebäude, Wohngebiet')

    await act(async () => button(container, 'Freigeben')!.click())

    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/place-suggestions/7/approve', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    expect(onChanged).toHaveBeenCalled()
    expect(container.textContent).toContain('Kein Platzvorschlag wartet auf eine Freigabe.')
  })

  it('shows open Place reports (SCRUM-71), and nothing without them', async () => {
    const { container } = await render([
      suggestion({ id: 1, name: 'Gemeldet', open_reports: 2 }),
      suggestion({ id: 2, name: 'Einmal', open_reports: 1 }),
      suggestion({ id: 3, name: 'Ruhig' }),
    ])
    const items = [...container.querySelectorAll('li')].map((li) => li.textContent)

    expect(items[0]).toContain('2 offene Meldungen (Freigeben oder Ablehnen schließt sie)')
    expect(items[1]).toContain('1 offene Meldung (')
    expect(items[2]).not.toContain('Meldung')
  })

  it('says "kein Hinweis" when OSM found nothing or did not answer', async () => {
    const { container } = await render([
      suggestion({ id: 1, osm_hints: [] }),
      suggestion({ id: 2, osm_hints: null }),
    ])

    expect(container.textContent).toContain('OSM-Hinweis: keiner')
    expect(container.textContent).toContain('OSM-Hinweis: keiner (OSM nicht erreichbar)')
  })

  it('cannot approve before 24 h', async () => {
    const { container } = await render([suggestion({ approvable: false })])

    expect(button(container, 'Freigeben')!.disabled).toBe(true)
    expect(container.textContent).toContain('Freigabe ab')
  })

  it('rejects only after a second step', async () => {
    const { container, fetchMock, onChanged } = await render([suggestion()], new Response(null, { status: 204 }))

    await act(async () => button(container, 'Ablehnen')!.click())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => button(container, 'Ja, ablehnen')!.click())

    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/place-suggestions/7/reject', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    expect(onChanged).toHaveBeenCalled()
  })

  it('opens the Place on the map', async () => {
    const { container, onOpenPlace } = await render([suggestion()])

    await act(async () => button(container, 'Auf der Karte')!.click())

    expect(onOpenPlace).toHaveBeenCalledWith(7)
  })
})
