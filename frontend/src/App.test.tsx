import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { fetchMe, type User } from './api/auth'
import { fetchMapMeetups, type MapMeetups, type Meetup } from './api/meetups'
import { fetchPlace, type Place } from './api/places'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-leaflet', () => {
  const map = {
    getBounds: () => ({ getWest: () => 12, getSouth: () => 51, getEast: () => 13, getNorth: () => 52 }),
    getCenter: () => ({ lat: 51.3, lng: 12.3 }),
    getZoom: () => 13,
    setView: vi.fn(),
  }
  return {
    MapContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    Popup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    TileLayer: () => null,
    useMap: () => map,
    useMapEvents: () => map,
  }
})

vi.mock('./api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/auth')>()),
  fetchMe: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./api/places', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/places')>()),
  fetchPlace: vi.fn(),
  fetchPlaces: vi.fn().mockResolvedValue({ places: [], truncated: false }),
}))
vi.mock('./api/contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/contacts')>()),
  fetchContacts: vi.fn().mockResolvedValue({ incoming: [], outgoing: [], contacts: [], blocked: [] }),
}))
vi.mock('./api/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/notifications')>()),
  fetchNotifications: vi.fn().mockResolvedValue([]),
}))
vi.mock('./api/meetups', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/meetups')>()),
  fetchMapMeetups: vi.fn().mockResolvedValue({ places: [], meetups: [], truncated: false }),
}))
vi.mock('./api/photos', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/photos')>()),
  fetchPhotosEnabled: vi.fn().mockResolvedValue(false),
}))
vi.mock('./api/live', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api/live')>()),
  connectLive: vi.fn(() => vi.fn()),
}))
vi.mock('./whileVisible', () => ({ pageVisible: () => true, whileVisible: () => vi.fn() }))
vi.mock('./places/mapView', () => ({ loadMapView: () => null, saveMapView: vi.fn() }))

vi.mock('./auth/AuthDialog', () => ({
  default: ({ onLoggedIn }: { onLoggedIn: (result: import('./api/auth').LoginResult) => void }) => (
    <button
      type="button"
      onClick={() =>
        onLoggedIn({
          token: 'second-token',
          user: { id: 2, nickname: 'Zweiter', avatar: 'fox', mfa_enabled: false, is_admin: false },
        })
      }
    >
      Als Zweiter anmelden
    </button>
  ),
}))
vi.mock('./auth/ContactsDialog', () => ({
  default: () => <div data-testid="contacts-dialog">Kontakte</div>,
}))
vi.mock('./notifications/PushOnboarding', () => ({ default: () => null }))
vi.mock('./places/MapToolbar', () => ({
  default: ({ onContacts }: { onContacts: () => void }) => (
    <button type="button" onClick={onContacts}>
      Kontakte öffnen
    </button>
  ),
}))
vi.mock('./places/PlaceSearch', () => ({ default: () => null }))
vi.mock('./places/MeetupMap', () => ({
  default: ({
    meetups,
    loading,
    onSpanChange,
  }: {
    meetups: Meetup[]
    loading: boolean
    onSpanChange: (span: 'now') => void
  }) => (
    <div>
      <button type="button" onClick={() => onSpanChange('now')}>Jetzt filtern</button>
      <span data-testid="map-loading">{String(loading)}</span>
      <span data-testid="map-contacts">{meetups.flatMap((meetup) => meetup.contacts ?? []).map((item) => item.nickname).join(',')}</span>
    </div>
  ),
}))
vi.mock('./places/ActivityFilter', () => ({ default: () => null }))
vi.mock('./places/CenterOn', () => ({ default: () => null }))
vi.mock('./places/PlaceDetail', () => ({
  default: ({ place }: { place: Place | null }) => <div data-testid="place-detail">{place?.name ?? 'Lädt'}</div>,
}))

let root: Root | null = null

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = '<div id="root"></div>'
  vi.mocked(fetchMe).mockResolvedValue({
    id: 1,
    nickname: 'Erster',
    avatar: 'fox',
    mfa_enabled: false,
    is_admin: false,
  })
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  window.history.replaceState(null, '', '/')
  vi.clearAllMocks()
})

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === text)
  if (!found) throw new Error(`Button not found: ${text}`)
  return found
}

// One round avatar button opens Konto (SCRUM-174); its text is the Avatar, its name is "Konto".
function accountButton(): HTMLButtonElement {
  const found = document.querySelector<HTMLButtonElement>('.account button[aria-label="Konto"]')
  if (!found) throw new Error('Button not found: Konto')
  return found
}

// The bottom bar's items have an icon in their text (SCRUM-165).
function navButton(label: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav button')).find((item) =>
    item.textContent?.includes(label),
  )
  if (!found) throw new Error(`Bottom bar item not found: ${label}`)
  return found
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

describe('App account changes', () => {
  it('does not reopen a dialog from the previous account after logout and login', async () => {
    localStorage.setItem('squadmeet.token', 'first-token')
    const container = document.querySelector('#root')!
    root = createRoot(container)
    await act(async () => root?.render(<App />))

    // Abmelden is in Konto (SCRUM-169), so the logout starts with that dialog open.
    await click(accountButton())
    expect(document.querySelector('.account-dialog')).not.toBeNull()

    await click(button('Abmelden'))
    expect(document.querySelector('.account-dialog')).toBeNull()
    await click(button('Anmelden'))
    await click(button('Als Zweiter anmelden'))

    expect(document.querySelector('.account-dialog')).toBeNull()
  })

  it('has no Abmelden in the top bar: it is in Konto (SCRUM-169)', async () => {
    localStorage.setItem('squadmeet.token', 'first-token')
    const container = document.querySelector('#root')!
    root = createRoot(container)
    await act(async () => root?.render(<App />))

    expect(document.querySelector('.account')?.textContent).not.toContain('Abmelden')
  })

  it('shows the bell and one avatar button that opens Konto (SCRUM-174)', async () => {
    localStorage.setItem('squadmeet.token', 'first-token')
    root = createRoot(document.querySelector('#root')!)
    await act(async () => root?.render(<App />))

    const buttons = [...document.querySelectorAll('.account button')]
    expect(buttons.map((item) => item.getAttribute('aria-label'))).toEqual(['Benachrichtigungen', 'Konto'])
    expect(accountButton().textContent).toContain('🦊')

    await click(accountButton())
    expect(document.querySelector('.account-dialog')).not.toBeNull()
  })

  it('names the round ＋ button "Platz vorschlagen" (SCRUM-174)', async () => {
    root = createRoot(document.querySelector('#root')!)
    await act(async () => root?.render(<App />))

    expect(document.querySelector('.suggest-button')?.getAttribute('aria-label')).toBe('Platz vorschlagen')
  })

  it('shows the legal links on the map only to a visitor: logged in, they are in Konto (SCRUM-174)', async () => {
    root = createRoot(document.querySelector('#root')!)
    await act(async () => root?.render(<App />))
    expect(document.querySelector('.legal-links')).not.toBeNull()

    await click(button('Anmelden'))
    await click(button('Als Zweiter anmelden'))

    expect(document.querySelector('.legal-links')).toBeNull()
  })

  it('shows a visitor the bottom bar with Filter and Anmelden; after login, the four items (SCRUM-175)', async () => {
    root = createRoot(document.querySelector('#root')!)
    await act(async () => root?.render(<App />))

    const items = () => [...document.querySelectorAll('.bottom-nav button')].map((item) => item.textContent)
    expect(items()).toEqual(['🎚️Filter', '🔑Anmelden'])

    await click(navButton('Anmelden'))
    await click(button('Als Zweiter anmelden'))

    expect(items()).toEqual(['🎚️Filter', '🤝Treffen', '⭐Favoriten', '👤Kontakte'])
  })

  it('opens the filter sheet from the bar; a Time choice loads Meetups and puts a badge on Filter (SCRUM-175)', async () => {
    root = createRoot(document.querySelector('#root')!)
    await act(async () => root?.render(<App />))
    expect(document.querySelector('.filter-sheet')).toBeNull()

    await click(navButton('Filter'))
    const sheet = document.querySelector<HTMLElement>('.filter-sheet')!
    const threeHours = [...sheet.querySelectorAll('button')].find((item) => item.textContent === '3 h')!
    await click(threeHours)

    expect(vi.mocked(fetchMapMeetups).mock.calls.at(-1)?.[1]).toBe('3h')
    expect(threeHours.getAttribute('aria-pressed')).toBe('true')
    await click(sheet.querySelector<HTMLButtonElement>('.dialog-close')!)
    expect(document.querySelector('.filter-sheet')).toBeNull()
    expect(navButton('Filter').getAttribute('aria-label')).toBe('Filter, 1 aktiv')
  })

  it('does not apply viewer-specific map data after logout or to the next account', async () => {
    localStorage.setItem('squadmeet.token', 'first-token')
    let finishFirst!: (answer: MapMeetups) => void
    vi.mocked(fetchMapMeetups)
      .mockImplementationOnce(() => new Promise((resolve) => { finishFirst = resolve }))
      .mockResolvedValue({ places: [], meetups: [], truncated: false })
    const container = document.querySelector('#root')!
    root = createRoot(container)
    await act(async () => root?.render(<App />))

    await click(button('Jetzt filtern'))
    expect(vi.mocked(fetchMapMeetups).mock.calls[0][3]).toBe('first-token')
    expect(document.querySelector('[data-testid="map-loading"]')?.textContent).toBe('true')

    await click(accountButton())
    await click(button('Abmelden'))
    await act(async () => finishFirst({
      places: [],
      truncated: false,
      meetups: [{
        id: 7,
        place_id: 3,
        host: null,
        party_size: 1,
        people: 1,
        participants: null,
        contacts: [{ id: 1, nickname: 'NurErster', avatar: 'fox' }],
        equipment: [],
        equipment_by_person: null,
        equipment_needed: [],
        equipment_missing: [],
        starts_at: '2026-10-21T10:00:00Z',
        ends_at: '2026-10-21T11:00:00Z',
        cancelled: false,
        move_offer: null,
        blocked_user_in: false,
        series_id: null,
        state: 'live',
        actions: [],
      }],
    }))
    expect(document.querySelector('[data-testid="map-contacts"]')?.textContent).toBe('')

    await click(button('Anmelden'))
    await click(button('Als Zweiter anmelden'))
    expect(vi.mocked(fetchMapMeetups).mock.calls.at(-1)?.[3]).toBe('second-token')
    expect(document.querySelector('[data-testid="map-contacts"]')?.textContent).toBe('')
  })

  it('refreshes an open Place for the restored viewer and ignores the old response', async () => {
    localStorage.setItem('squadmeet.token', 'first-token')
    window.history.replaceState(null, '', '/platz/7')
    let restoreUser!: (user: User) => void
    vi.mocked(fetchMe).mockImplementation(() => new Promise((resolve) => { restoreUser = resolve }))
    let finishGuest!: (place: Place) => void
    const basePlace: Place = {
      id: 7,
      name: 'Gastansicht',
      activity_type: 'table_tennis',
      lat: 51.3,
      lon: 12.3,
      people_now: 2,
      is_suggestion: false,
      confirmations: 0,
    }
    vi.mocked(fetchPlace)
      .mockImplementationOnce(() => new Promise((resolve) => { finishGuest = resolve }))
      .mockResolvedValueOnce({ ...basePlace, name: 'Ansicht für Erster', people_now: 1 })
    root = createRoot(document.querySelector('#root')!)
    await act(async () => root?.render(<App />))

    await act(async () => restoreUser({
      id: 1,
      nickname: 'Erster',
      avatar: 'fox',
      mfa_enabled: false,
      is_admin: false,
    }))
    expect(vi.mocked(fetchPlace)).toHaveBeenLastCalledWith(7, 'first-token')
    expect(document.querySelector('[data-testid="place-detail"]')?.textContent).toBe('Ansicht für Erster')

    await act(async () => finishGuest(basePlace))
    expect(document.querySelector('[data-testid="place-detail"]')?.textContent).toBe('Ansicht für Erster')
  })
})
