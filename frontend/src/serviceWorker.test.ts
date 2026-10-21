// The service worker in public/sw.js (SCRUM-44, SCRUM-109): it runs in its own global scope, so
// the test runs the file's text with a fake `self` and calls its listeners.
import { describe, expect, it, vi } from 'vitest'
import source from '../public/sw.js?raw'

const ORIGIN = 'https://squadmeet.duckdns.org'

type Listener = (event: Record<string, unknown>) => void
type FakeClient = { navigate?: (url: string) => Promise<unknown>; focus: () => Promise<unknown> }

function worker(windows: FakeClient[]) {
  const listeners: Record<string, Listener> = {}
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: Listener) => (listeners[type] = listener),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(), matchAll: vi.fn(async () => windows), openWindow: vi.fn() },
    registration: { showNotification: vi.fn() },
  }
  new Function('self', source)(self)
  return { self, listeners }
}

async function tap(windows: FakeClient[], url: string) {
  const { self, listeners } = worker(windows)
  let done: Promise<unknown> = Promise.resolve()
  listeners.notificationclick({
    notification: { close: vi.fn(), data: { url } },
    waitUntil: (promise: Promise<unknown>) => (done = promise),
  })
  await done
  return self
}

describe('service worker', () => {
  it('takes over at once after an update', () => {
    const { self, listeners } = worker([])

    listeners.install({})
    listeners.activate({ waitUntil: () => {} })

    expect(self.skipWaiting).toHaveBeenCalled()
    expect(self.clients.claim).toHaveBeenCalled()
  })

  it('shows a push message with a PNG icon and keeps its URL', () => {
    const { self, listeners } = worker([])

    listeners.push({
      data: { json: () => ({ title: 'Neues Treffen', body: 'Tischtennis', url: '/platz/7' }) },
      waitUntil: () => {},
    })

    expect(self.registration.showNotification).toHaveBeenCalledWith(
      'Neues Treffen',
      expect.objectContaining({ body: 'Tischtennis', icon: '/icon-192.png', data: { url: '/platz/7' } }),
    )
  })

  it('opens the Place in an open tab', async () => {
    const tab = { navigate: vi.fn(async () => tab), focus: vi.fn(async () => tab) }

    await tap([tab], '/platz/7')

    expect(tab.navigate).toHaveBeenCalledWith(`${ORIGIN}/platz/7`)
    expect(tab.focus).toHaveBeenCalled()
  })

  it('still focuses a tab that it cannot navigate', async () => {
    const tab = { navigate: vi.fn(async () => Promise.reject(new TypeError('not controlled'))), focus: vi.fn() }

    await tap([tab], '/platz/7')

    expect(tab.focus).toHaveBeenCalled()
  })

  it('opens only pages of the app, never another site', async () => {
    const self = await tap([], 'https://evil.example/phish')

    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`)
  })
})
