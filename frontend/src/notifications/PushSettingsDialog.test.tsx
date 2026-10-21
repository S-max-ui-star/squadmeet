import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PushSettingsDialog from './PushSettingsDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function renderDialog(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => createRoot(container).render(<PushSettingsDialog token="tok" onClose={() => {}} />))
  return container
}

describe('PushSettingsDialog (SCRUM-44)', () => {
  it('explains when push is not configured on the server', async () => {
    const container = await renderDialog(vi.fn(async () => Response.json({ enabled: false, public_key: null })))
    expect(container.textContent).toContain('Push ist auf diesem Server noch nicht eingerichtet')
  })

  it('asks permission, subscribes and stores the browser subscription', async () => {
    const subscription = {
      endpoint: 'https://push.example/send/one',
      toJSON: () => ({
        endpoint: 'https://push.example/send/one',
        keys: { p256dh: 'browser-key', auth: 'browser-secret' },
      }),
    }
    const subscribe = vi.fn(async () => subscription)
    const registration = { pushManager: { getSubscription: vi.fn(async () => null), subscribe } }
    vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn(async () => 'granted') })
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(registration) },
    })
    vi.stubGlobal('PushManager', class {})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ enabled: true, public_key: 'AQID' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const container = await renderDialog(fetchMock)

    await act(async () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Push einschalten')!.click())

    expect(Notification.requestPermission).toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledWith({ userVisibleOnly: true, applicationServerKey: new Uint8Array([1, 2, 3]) })
    expect(fetchMock.mock.calls[1][0]).toBe('/api/push/subscription')
    expect(container.textContent).toContain('Push ist eingeschaltet')
  })

  it('assigns an existing browser subscription to the signed-in user', async () => {
    const subscription = {
      endpoint: 'https://push.example/send/existing',
      toJSON: () => ({
        endpoint: 'https://push.example/send/existing',
        keys: { p256dh: 'browser-key', auth: 'browser-secret' },
      }),
    }
    const registration = { pushManager: { getSubscription: vi.fn(async () => subscription) } }
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { ready: Promise.resolve(registration) },
    })
    vi.stubGlobal('PushManager', class {})
    vi.stubGlobal('Notification', {})
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ enabled: true, public_key: 'AQID' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))

    const container = await renderDialog(fetchMock)

    expect(fetchMock.mock.calls[1][0]).toBe('/api/push/subscription')
    expect(container.textContent).toContain('Push ist eingeschaltet')
  })
})
