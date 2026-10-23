import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveToken, type User } from '../api/auth'
import { announceRatingChange } from '../api/live'
import type { RatingSummary } from '../api/ratings'
import PlaceRatings from './PlaceRatings'
import { ProblemFoldContext } from './problemFold'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const paula: User = { id: 1, nickname: 'Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }

const empty: RatingSummary = {
  count: 0,
  average_stars: null,
  top_reasons: [],
  condition: { state: 'unknown', issues: [] },
}

const rated: RatingSummary = {
  count: 2,
  average_stars: 3.5,
  top_reasons: [{ key: 'table_good', label: 'Platte in gutem Zustand', positive: true, count: 2 }],
  condition: {
    state: 'issues',
    issues: [
      {
        key: 'net_missing',
        label: 'Netz fehlt oder ist kaputt',
        positive: false,
        count: 1,
        needs_check: false,
        still_there_votes: 0,
        fixed_votes: 0,
      },
    ],
  },
}

// The same issue, two months later: users are asked about it.
const unconfirmed: RatingSummary = {
  ...rated,
  condition: {
    state: 'issues',
    issues: [{ ...rated.condition.issues[0], needs_check: true, still_there_votes: 1, fixed_votes: 0 }],
  },
}

const reasons = [
  { key: 'table_good', label: 'Platte in gutem Zustand', positive: true },
  { key: 'net_missing', label: 'Netz fehlt oder ist kaputt', positive: false },
]

// Unmounted after each test, so an old panel does not answer a later live event.
const roots: Root[] = []

const ratingList = [
  {
    stars: 2,
    reasons: ['Netz fehlt oder ist kaputt', 'Müll oder Verschmutzung'],
    updated_at: '2026-10-20T14:30:00Z',
  },
  { stars: 5, reasons: ['Platte in gutem Zustand'], updated_at: '2026-10-19T08:00:00Z' },
]

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
  localStorage.clear()
})

// Answers by URL, like the API: summary, Reasons, own Rating, save.
function api(summary: RatingSummary, mine: unknown = null) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/reasons')) return Response.json(reasons)
    if (url.endsWith('/ratings/list')) return Response.json(ratingList)
    if (url.endsWith('/ratings/mine') && init?.method === 'PUT') {
      return Response.json({ place_id: 3, ...JSON.parse(String(init.body)), updated_at: 'now' })
    }
    if (url.endsWith('/ratings/mine')) return Response.json(mine)
    if (url.endsWith('/check')) {
      const issue = { ...unconfirmed.condition.issues[0], still_there_votes: 2 }
      return Response.json({ ...unconfirmed, condition: { state: 'issues', issues: [issue] } })
    }
    return Response.json(summary)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

// A table tennis table in the Clara-Zetkin-Park, Leipzig (SCRUM-55).
const leipzigPlace = { name: 'Tischtennis', lat: 51.33261, lon: 12.35673, address: 'Karl-Tauchnitz-Straße' }

async function render(
  user: User | null,
  onLoginNeeded = () => {},
  place: typeof leipzigPlace | null = null,
  readOnly = false,
) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () =>
    root.render(
      <PlaceRatings placeId={3} place={place} user={user} onLoginNeeded={onLoginNeeded} readOnly={readOnly} />,
    ),
  )
  return container
}

// Inside the Place detail: the City report goes into the slot of "Problem melden" (SCRUM-176).
async function renderInFold(user: User | null) {
  const slot = document.createElement('div')
  document.body.append(slot)
  const fold = { slot, open: vi.fn(), setHighlighted: vi.fn() }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () =>
    root.render(
      <ProblemFoldContext.Provider value={fold}>
        <PlaceRatings placeId={3} place={leipzigPlace} user={user} onLoginNeeded={() => {}} />
      </ProblemFoldContext.Provider>,
    ),
  )
  return { container, slot, fold }
}

// A fetch answer the test sends later, to put answers out of order.
function later() {
  let send!: (response: Response) => void
  const response = new Promise<Response>((resolve) => (send = resolve))
  return { response, send }
}

const status = (container: HTMLElement) => container.querySelector('.city-report [role="status"]')!.textContent

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(text))

async function click(element: HTMLElement | undefined) {
  await act(async () => element!.click())
}

describe('PlaceRatings', () => {
  it('loads the Ratings and the Condition again on a live event for its own Place (SCRUM-98)', async () => {
    const fetch = api(empty)
    const container = await render(null)
    expect(container.textContent).toContain('Noch keine Bewertungen')

    fetch.mockImplementation(async () => Response.json(rated))
    await act(async () => announceRatingChange(4))
    expect(container.textContent).toContain('Noch keine Bewertungen')
    await act(async () => announceRatingChange(3))

    expect(container.textContent).toContain('2 Bewertungen')
    expect(container.textContent).toContain('Mängel gemeldet')
  })

  it('loads again when the page comes back to the front (SCRUM-98)', async () => {
    const fetch = api(empty)
    await render(null)
    expect(fetch).toHaveBeenCalledTimes(1)

    // jsdom says "prerender"; a real page in front says "visible".
    const visible = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    visible.mockRestore()

    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('shows average stars, top Reasons and the Condition', async () => {
    api(rated)

    const text = (await render(null)).textContent

    expect(text).toContain('3,5')
    expect(text).toContain('2 Bewertungen')
    expect(text).toContain('Platte in gutem Zustand')
    expect(text).toContain('Mängel gemeldet')
    expect(text).toContain('Netz fehlt oder ist kaputt (1×)')
  })

  it('folds out every anonymous Rating with Reasons and the newest change date first', async () => {
    const fetchMock = api(rated)
    const container = await render(null)

    expect(container.textContent).toContain('Alle Bewertungen (2)')
    expect(container.textContent).not.toContain('20.10.2026')

    await click(button(container, 'Alle Bewertungen'))

    expect(container.textContent).toContain('20.10.2026')
    expect(container.textContent).toContain('Netz fehlt oder ist kaputt')
    expect(container.textContent).toContain('Müll oder Verschmutzung')
    expect(container.textContent).toContain('19.10.2026')
    expect(container.textContent!.indexOf('20.10.2026')).toBeLessThan(container.textContent!.indexOf('19.10.2026'))
    // A guest sends no token.
    const [, init] = fetchMock.mock.calls.find(([url]) => url === '/api/places/3/ratings/list')!
    expect(init?.headers).toBeUndefined()
  })

  it('crosses out the Reason of a fixed issue and keeps the Rating', async () => {
    const net = { key: 'net_missing', label: 'Netz fehlt oder ist kaputt', positive: false, count: 1 }
    api({
      count: 1,
      average_stars: 2,
      top_reasons: [{ ...net, fixed_at: '2026-10-20T10:00:00Z' }],
      condition: { state: 'good', issues: [] },
    })

    const container = await render(null)

    const chip = container.querySelector('.reason-chips .fixed')!
    expect(chip.querySelector('del')?.textContent).toBe('Netz fehlt oder ist kaputt 1')
    expect(chip.textContent).toContain('behoben am 20.10.')
    expect(container.textContent).toContain('1 Bewertung')
  })

  it('shows a Reason named again after the fix normally', async () => {
    const net = { key: 'net_missing', label: 'Netz fehlt oder ist kaputt', positive: false, count: 1 }
    api({
      ...rated,
      count: 2,
      top_reasons: [{ ...net, fixed_at: '2026-10-20T10:00:00Z' }, { ...net, fixed_at: null }],
    })

    const container = await render(null)

    expect(container.querySelectorAll('.reason-chips .fixed')).toHaveLength(1)
    expect(container.querySelector('.reason-chips .bad')?.textContent).toBe('Netz fehlt oder ist kaputt 1')
    expect(container.textContent).toContain('Mängel gemeldet')
  })

  it('says when there are no Ratings yet', async () => {
    api(empty)

    const text = (await render(null)).textContent

    expect(text).toContain('Noch keine Bewertungen')
    expect(text).toContain('keine aktuellen Bewertungen')
  })

  it('asks a guest to log in before rating', async () => {
    api(empty)
    const onLoginNeeded = vi.fn()
    const container = await render(null, onLoginNeeded)

    await click(button(container, 'Bewertung erstellen'))

    expect(onLoginNeeded).toHaveBeenCalledOnce()
  })

  it('saves only with stars and at least one Reason', async () => {
    saveToken('tok')
    const fetchMock = api(empty)
    const container = await render(paula)
    await click(button(container, 'Bewertung erstellen'))
    const save = () => button(container, 'Bewertung speichern')!

    expect(save().disabled).toBe(true)
    await click(container.querySelector<HTMLButtonElement>('[aria-label="4 Sterne"]')!)
    expect(save().disabled).toBe(true)
    expect(container.textContent).toContain('mindestens eine Begründung')
    await click(button(container, 'Netz fehlt'))
    expect(save().disabled).toBe(false)

    await click(save())

    const put = fetchMock.mock.calls.find(([, init]) => init?.method === 'PUT')!
    expect(JSON.parse(String(put[1]!.body))).toEqual({ stars: 4, reasons: ['net_missing'] })
    expect(button(container, 'Bewertung ändern')).toBeDefined()
  })

  it('starts the form with the own Rating, to change it', async () => {
    saveToken('tok')
    api(rated, { place_id: 3, stars: 2, reasons: ['net_missing'], updated_at: 'x' })
    const container = await render(paula)

    await click(button(container, 'Bewertung ändern'))

    expect(container.querySelector('[aria-label="2 Sterne"]')!.getAttribute('aria-pressed')).toBe('true')
    expect(button(container, 'Netz fehlt')!.getAttribute('aria-pressed')).toBe('true')
    expect(button(container, 'Platte in gutem')!.getAttribute('aria-pressed')).toBe('false')
  })

  it('asks "Schon behoben?"; "noch nicht behoben" only for an issue not confirmed for two months (SCRUM-82)', async () => {
    api(rated)
    const fresh = await render(paula)
    // "Behoben" is open at any time, so a repair does not wait two months.
    expect(fresh.textContent).toContain('Schon behoben?')
    expect(button(fresh, 'Ja, behoben')).toBeDefined()
    expect(button(fresh, 'Nein, noch nicht behoben')).toBeUndefined()

    document.body.innerHTML = ''
    api(unconfirmed)
    const container = await render(paula)
    expect(container.textContent).toContain('Schon behoben?')
    expect(button(container, 'Ja, behoben')).toBeDefined()
    expect(button(container, 'Nein, noch nicht behoben')).toBeDefined()
    expect(container.textContent).toContain('Seit über 2 Monaten nicht bestätigt')
    expect(container.textContent).toContain('Noch so: 1/3')
  })

  it('sends the answer and shows the new count', async () => {
    saveToken('tok')
    const fetchMock = api(unconfirmed)
    const container = await render(paula)

    await click(button(container, 'Nein, noch nicht behoben'))

    const [url, init] = fetchMock.mock.calls.find(([u]) => u.endsWith('/check'))!
    expect(url).toBe('/api/places/3/condition/net_missing/check')
    expect(JSON.parse(String(init!.body))).toEqual({ still_there: true })
    expect(container.textContent).toContain('Noch so: 2/3')
    expect(container.textContent).toContain('Danke für deine Antwort')
  })

  it('asks a guest to log in before answering', async () => {
    api(unconfirmed)
    const onLoginNeeded = vi.fn()
    const container = await render(null, onLoginNeeded)

    await click(button(container, 'Ja, behoben'))

    expect(onLoginNeeded).toHaveBeenCalledOnce()
  })

  it('links to the city report of the Place and highlights it with a Condition issue (SCRUM-55)', async () => {
    api(rated)
    const container = await render(null, () => {}, leipzigPlace)

    const box = container.querySelector('.city-report')!
    expect(box.className).toContain('highlighted')
    await click(button(container, 'Willst du das der Stadt melden?'))
    const link = box.querySelector<HTMLAnchorElement>('a[target="_blank"]')!
    expect(link.href).toBe('https://mitdenken.sachsen.de/maengelmelder-L')
    expect(link.textContent).toContain('Mängelmelder der Stadt Leipzig')
    expect(box.querySelector<HTMLAnchorElement>('a[href^="tel:"]')!.getAttribute('href')).toBe('tel:0341115')
    expect(box.textContent).toContain('Amt für Stadtgrün und Gewässer')
    expect(box.querySelector<HTMLAnchorElement>('a[href^="mailto:"]')!.href).toContain('stadtgruen.gewaesser@leipzig.de')
  })

  it('shows the link without highlight when nothing is to fix', async () => {
    api(empty)
    const container = await render(null, () => {}, leipzigPlace)

    expect(container.querySelector('.city-report')!.className).not.toContain('highlighted')
  })

  it('shows the rate button under the Ratings and the city report folded below it (SCRUM-82)', async () => {
    api(rated)
    const container = await render(paula, () => {}, leipzigPlace)

    const order = [...container.querySelectorAll('.rating-average, .condition, .rate-button, .city-report')].map(
      (element) => element.className.split(' ')[0],
    )
    expect(order).toEqual(['rating-average', 'condition', 'rate-button', 'city-report'])
    const toggle = button(container, 'Willst du das der Stadt melden?')!
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('Mängelmelder')

    await click(toggle)

    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(container.textContent).toContain('Mängelmelder der Stadt Leipzig')
  })

  it('shows no city report for a Place outside the five cities', async () => {
    api(rated)
    const container = await render(null, () => {}, { ...leipzigPlace, lat: 51.05, lon: 13.74 })

    expect(container.querySelector('.city-report')).toBeNull()
  })

  // SCRUM-163: a screen reader hears what the stars mean.
  it('reads the average out as stars', async () => {
    api(rated)

    const container = await render(null)

    expect(container.querySelector('.rating-average [role="img"]')?.getAttribute('aria-label')).toBe('3,5 von 5 Sternen')
  })

  it('shows the Place text to copy by hand when the browser cannot copy (SCRUM-163)', async () => {
    api(rated)
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined })
    const container = await render(null, () => {}, leipzigPlace)

    await click(button(container, 'Willst du das der Stadt melden?'))
    await click(button(container, 'Ort für die Meldung kopieren'))

    const field = container.querySelector<HTMLTextAreaElement>('.city-report-copy textarea')!
    expect(field.readOnly).toBe(true)
    expect(field.value).toContain('Karl-Tauchnitz-Straße')
  })

  it('loads the summary with the token after saving a Rating (SCRUM-163)', async () => {
    saveToken('tok')
    const fetchMock = api(empty)
    const container = await render(paula)

    await click(button(container, 'Bewertung erstellen'))
    await click(container.querySelector<HTMLButtonElement>('[aria-label="4 Sterne"]')!)
    await click(button(container, 'Platte in gutem Zustand'))
    await click(button(container, 'Bewertung speichern'))

    const put = fetchMock.mock.calls.findIndex(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')
    const after = fetchMock.mock.calls.slice(put + 1).find(([url]) => String(url).endsWith('/ratings'))!
    expect((after[1] as RequestInit).headers).toEqual({ Authorization: 'Bearer tok' })
  })

  it('puts the city report into "Problem melden" and marks it while the Condition has issues (SCRUM-176)', async () => {
    api(rated)
    const { container, slot, fold } = await renderInFold(null)

    expect(container.querySelector('.city-report')).toBeNull()
    expect(slot.querySelector('.city-report')).not.toBeNull()
    expect(fold.setHighlighted).toHaveBeenLastCalledWith(true)
    expect(fold.open).not.toHaveBeenCalled()
  })

  it('opens "Problem melden" after a Rating that names an issue (SCRUM-176)', async () => {
    saveToken('tok')
    let saved = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/reasons')) return Response.json(reasons)
        if (url.endsWith('/ratings/mine') && init?.method === 'PUT') {
          saved = true
          return Response.json({ place_id: 3, ...JSON.parse(String(init.body)), updated_at: 'now' })
        }
        if (url.endsWith('/ratings/mine')) return Response.json(null)
        return Response.json(saved ? rated : empty)
      }),
    )
    const { container, slot, fold } = await renderInFold(paula)
    expect(fold.setHighlighted).toHaveBeenLastCalledWith(false)

    await click(button(container, 'Bewertung erstellen'))
    await click(container.querySelector<HTMLButtonElement>('[aria-label="2 Sterne"]')!)
    await click(button(container, 'Netz fehlt'))
    await click(button(container, 'Bewertung speichern'))

    expect(fold.open).toHaveBeenCalled()
    expect(slot.textContent).toContain('Mängelmelder der Stadt Leipzig')
  })

  it('opens the city report after a Rating that names an issue', async () => {
    saveToken('tok')
    let saved = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith('/reasons')) return Response.json(reasons)
        if (url.endsWith('/ratings/mine') && init?.method === 'PUT') {
          saved = true
          return Response.json({ place_id: 3, ...JSON.parse(String(init.body)), updated_at: 'now' })
        }
        if (url.endsWith('/ratings/mine')) return Response.json(null)
        return Response.json(saved ? rated : empty)
      }),
    )
    const container = await render(paula, () => {}, leipzigPlace)
    expect(container.textContent).not.toContain('Mängelmelder')

    await click(button(container, 'Bewertung erstellen'))
    await click(container.querySelector<HTMLButtonElement>('[aria-label="2 Sterne"]')!)
    await click(button(container, 'Netz fehlt'))
    await click(button(container, 'Bewertung speichern'))

    // The city report opens by itself after a Rating that names something to fix.
    expect(container.textContent).toContain('Mängelmelder der Stadt Leipzig')
  })

  // SCRUM-162: the result of copying is read out, and a good retry clears the failure.
  it('reads out a copied Place and a failed copy, and a retry clears the failure', async () => {
    api(rated)
    const writeText = vi.fn().mockRejectedValueOnce(new Error('denied')).mockResolvedValueOnce(undefined)
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const container = await render(null, () => {}, leipzigPlace)
    await click(button(container, 'Willst du das der Stadt melden?'))

    await click(button(container, 'Ort für die Meldung kopieren'))
    expect(status(container)).toBe('Kopieren ging nicht.')
    expect(container.querySelector('.city-report-copy textarea')).not.toBeNull()

    await click(button(container, 'Ort für die Meldung kopieren'))
    expect(status(container)).toBe('Ort kopiert.')
    expect(container.querySelector('.city-report-copy textarea')).toBeNull()
  })

  // SCRUM-156: a slow older load must not replace a newer one.
  it('keeps the newest summary when the answers come back out of order', async () => {
    const first = later()
    const second = later()
    const answers = [first, second]
    vi.stubGlobal('fetch', vi.fn(() => answers.shift()!.response))
    const container = await render(null)

    await act(async () => announceRatingChange(3))
    await act(async () => second.send(Response.json(rated)))
    await act(async () => first.send(Response.json(empty)))

    expect(container.textContent).toContain('2 Bewertungen')
    expect(container.textContent).not.toContain('Noch keine Bewertungen')
  })

  it('clears a load error with the next good load (SCRUM-156)', async () => {
    const fetchMock = vi.fn(async () => Response.json({ detail: 'Server kaputt' }, { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    const container = await render(null)
    expect(container.textContent).toContain('Server kaputt')

    fetchMock.mockImplementation(async () => Response.json(rated))
    await click(button(container, 'Erneut laden'))

    expect(container.textContent).not.toContain('Server kaputt')
    expect(container.textContent).toContain('2 Bewertungen')
  })

  // SCRUM-157: "Bewertung erstellen" only once it is clear that there is no own Rating.
  it('waits for the own Rating before it offers to rate', async () => {
    saveToken('tok')
    const mine = later()
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('/ratings/mine') ? mine.response : Response.json(rated))),
    )
    const container = await render(paula)

    const waiting = button(container, 'Lädt …')!
    expect(waiting.disabled).toBe(true)
    expect(button(container, 'Bewertung erstellen')).toBeUndefined()

    await act(async () => mine.send(Response.json({ place_id: 3, stars: 2, reasons: ['net_missing'], updated_at: 'x' })))
    expect(button(container, 'Bewertung ändern')).toBeDefined()
  })

  it('offers a retry, not a new Rating, when the own Rating does not load (SCRUM-157)', async () => {
    saveToken('tok')
    let fail = true
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (!url.endsWith('/ratings/mine')) return Response.json(rated)
        if (fail) return Response.json({ detail: 'weg' }, { status: 500 })
        return Response.json({ place_id: 3, stars: 4, reasons: ['table_good'], updated_at: 'x' })
      }),
    )
    const container = await render(paula)
    expect(container.textContent).toContain('Deine Bewertung konnte nicht geladen werden')
    expect(button(container, 'Bewertung erstellen')).toBeUndefined()

    fail = false
    await click(button(container, 'Erneut laden'))

    expect(container.textContent).not.toContain('Deine Bewertung konnte nicht geladen werden')
    expect(button(container, 'Bewertung ändern')).toBeDefined()
  })

  // SCRUM-158: an Admin reviews a reported Place: the Ratings show, nothing can be changed.
  it('only shows the Ratings of a Place under review', async () => {
    saveToken('tok')
    api(unconfirmed)
    const container = await render(paula, () => {}, null, true)

    expect(container.textContent).toContain('3,5')
    expect(container.textContent).toContain('Mängel gemeldet')
    expect(container.textContent).toContain('Noch so: 1/3')
    expect(button(container, 'Alle Bewertungen')).toBeDefined()
    expect(container.querySelector('.rate-button')).toBeNull()
    expect(button(container, 'Ja, behoben')).toBeUndefined()
    expect(button(container, 'Nein, noch nicht behoben')).toBeUndefined()
  })
})
