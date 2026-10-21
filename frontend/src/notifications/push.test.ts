import { afterEach, describe, expect, it, vi } from 'vitest'
import { applicationServerKey, dropPushSubscription, needsIosHomeScreen } from './push'

afterEach(() => {
  vi.unstubAllGlobals()
})

// A browser with Push support and the given subscription of this page.
function browserWith(subscription: { endpoint: string; unsubscribe: () => Promise<boolean> } | null) {
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', class {})
  vi.stubGlobal('navigator', {
    serviceWorker: { getRegistration: async () => ({ pushManager: { getSubscription: async () => subscription } }) },
  })
}

describe('Web Push browser helpers (SCRUM-44)', () => {
  it('decodes a URL-safe VAPID public key', () => {
    expect([...applicationServerKey('AQID-_8')]).toEqual([1, 2, 3, 251, 255])
  })

  it('shows the home-screen hint only for iOS outside standalone mode', () => {
    expect(needsIosHomeScreen('Mozilla/5.0 (iPhone)', false)).toBe(true)
    expect(needsIosHomeScreen('Mozilla/5.0 (iPhone)', true)).toBe(false)
    expect(needsIosHomeScreen('Mozilla/5.0 (Linux; Android 15)', false)).toBe(false)
  })

  // SCRUM-146: after a logout a shared device must not get the old account's Push messages.
  it('removes the subscription on the server and in the browser at logout', async () => {
    const unsubscribe = vi.fn(async () => true)
    browserWith({ endpoint: 'https://push.example/send/1', unsubscribe })
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    await dropPushSubscription('tok')

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/push/subscription')
    expect(init.method).toBe('DELETE')
    expect(JSON.parse(String(init.body))).toEqual({ endpoint: 'https://push.example/send/1' })
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('still ends the browser subscription when the server cannot be reached', async () => {
    const unsubscribe = vi.fn(async () => true)
    browserWith({ endpoint: 'https://push.example/send/1', unsubscribe })
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))))

    await dropPushSubscription('tok')

    expect(unsubscribe).toHaveBeenCalled()
  })

  it('does nothing without a subscription', async () => {
    browserWith(null)
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await dropPushSubscription('tok')

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
