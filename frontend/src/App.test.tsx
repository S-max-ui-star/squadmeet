import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { fetchMe } from './api/auth'

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
vi.mock('./places/MeetupMap', () => ({ default: () => null }))
vi.mock('./places/ActivityFilter', () => ({ default: () => null }))

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
  vi.clearAllMocks()
})

function button(text: string): HTMLButtonElement {
  const found = Array.from(document.querySelectorAll('button')).find((item) => item.textContent === text)
  if (!found) throw new Error(`Button not found: ${text}`)
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

    await click(button('Kontakte öffnen'))
    expect(document.querySelector('[data-testid="contacts-dialog"]')).not.toBeNull()

    await click(button('Abmelden'))
    await click(button('Anmelden'))
    await click(button('Als Zweiter anmelden'))

    expect(document.querySelector('[data-testid="contacts-dialog"]')).toBeNull()
  })
})
