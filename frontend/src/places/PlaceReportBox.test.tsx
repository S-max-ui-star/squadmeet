import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveToken } from '../api/auth'
import type { Place } from '../api/places'
import PlaceReportBox from './PlaceReportBox'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const user = { id: 1, nickname: 'Stefan', avatar: 'fox', is_admin: false, mfa_enabled: false }

const place: Place = {
  id: 7,
  name: 'Korbanlage',
  activity_type: 'basketball',
  lat: 51.3,
  lon: 12.3,
  people_now: 0,
  is_suggestion: false,
  confirmations: 0,
  open_reports: 0,
  report_reason: null,
}

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
})

function render(props: Parameters<typeof PlaceReportBox>[0]) {
  const container = document.createElement('div')
  document.body.append(container)
  act(() => createRoot(container).render(<PlaceReportBox {...props} />))
  return container
}

function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

describe('PlaceReportBox', () => {
  it('shows no hint without an open report', () => {
    const text = render({ place }).textContent

    expect(text).not.toContain('Von Nutzern gemeldet')
    expect(text).toContain('Platz melden')
  })

  it('shows the most common reason from the first open report', () => {
    const reported = { ...place, open_reports: 1, report_reason: 'not_public' as const }
    const text = render({ place: reported }).textContent

    expect(text).toContain('Von Nutzern gemeldet: Nicht öffentlich')
    expect(text).not.toContain('nicht auf der Karte')
  })

  it('tells an Admin that a Place with 3 reports is off the map', () => {
    const hidden = { ...place, open_reports: 3, report_reason: 'dangerous' as const }

    expect(render({ place: hidden }).textContent).toContain('3 Meldungen, nicht auf der Karte')
  })

  it('asks a guest to log in', () => {
    const onLoginNeeded = vi.fn()
    const container = render({ place, user: null, onLoginNeeded })

    act(() => button(container, 'Platz melden')?.click())

    expect(onLoginNeeded).toHaveBeenCalled()
    expect(container.textContent).not.toContain('Gefährlich')
  })

  it('sends the chosen reason and thanks the user', async () => {
    saveToken('t')
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const onReported = vi.fn()
    const container = render({ place, user, onReported })

    act(() => button(container, 'Platz melden')?.click())
    await act(async () => button(container, 'Gefährlich')?.click())

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/places/7/reports')
    expect(JSON.parse(init.body)).toEqual({ reason: 'dangerous' })
    expect(onReported).toHaveBeenCalled()
    expect(container.textContent).toContain('Danke!')
    expect(button(container, 'Platz melden')).toBeUndefined()
  })

  it('shows the server answer for a second report', async () => {
    saveToken('t')
    const conflict = new Response(JSON.stringify({ detail: 'Du hast diesen Platz schon gemeldet' }), {
      status: 409,
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(conflict))
    const onReported = vi.fn()
    const container = render({ place, user, onReported })

    act(() => button(container, 'Platz melden')?.click())
    await act(async () => button(container, 'Nicht öffentlich')?.click())

    expect(container.textContent).toContain('Du hast diesen Platz schon gemeldet')
    expect(onReported).not.toHaveBeenCalled()
  })

  // SCRUM-158: from 3 reports an Admin reviews the Place; one more report is refused.
  it('shows the reports of a Place under review without "Platz melden"', () => {
    const reported = { ...place, open_reports: 3, report_reason: 'dangerous' as const }

    const text = render({ place: reported, user }).textContent

    expect(text).toContain('Von Nutzern gemeldet: Gefährlich (3 Meldungen, nicht auf der Karte)')
    expect(text).toContain('Bis ein Admin entschieden hat')
    expect(text).not.toContain('Platz melden')
  })

  it('keeps "Platz melden" for a reported Place still on the map (SCRUM-158)', () => {
    const reported = { ...place, open_reports: 2, report_reason: 'dangerous' as const }

    const text = render({ place: reported, user }).textContent

    expect(text).toContain('Platz melden')
    expect(text).not.toContain('Bis ein Admin entschieden hat')
  })
})
