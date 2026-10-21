import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PushOnboarding from './PushOnboarding'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
})

function supportPush(subscription: PushSubscription | null = null) {
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      ready: Promise.resolve({ pushManager: { getSubscription: vi.fn(async () => subscription) } }),
    },
  })
  vi.stubGlobal('PushManager', class {})
  vi.stubGlobal('Notification', { permission: 'default', requestPermission: vi.fn() })
}

const byText = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)!

async function renderOnboarding(fetchMock: ReturnType<typeof vi.fn>, onConfigure = vi.fn()) {
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () =>
    createRoot(container).render(
      <PushOnboarding userId={7} token="tok" onConfigure={onConfigure} />,
    ),
  )
  return { container, onConfigure }
}

describe('PushOnboarding (SCRUM-44)', () => {
  it('offers configured Push without opening the browser permission prompt', async () => {
    supportPush()
    const { container } = await renderOnboarding(
      vi.fn(async () => Response.json({ enabled: true, public_key: 'AQID' })),
    )

    expect(container.textContent).toContain('Push einrichten')
    expect(Notification.requestPermission).not.toHaveBeenCalled()
  })

  it('opens Push settings after the user chooses to configure it', async () => {
    supportPush()
    const { container, onConfigure } = await renderOnboarding(
      vi.fn(async () => Response.json({ enabled: true, public_key: 'AQID' })),
    )

    act(() => byText(container, 'Push einrichten').click())

    expect(onConfigure).toHaveBeenCalledOnce()
    expect(localStorage.getItem('squadmeet.push-onboarding.7')).toBe('configure')
  })

  it('dismisses the one-time hint while keeping Push available in the account settings', async () => {
    supportPush()
    const { container, onConfigure } = await renderOnboarding(
      vi.fn(async () => Response.json({ enabled: true, public_key: 'AQID' })),
    )

    act(() => byText(container, 'Später').click())

    expect(container.textContent).toBe('')
    expect(onConfigure).not.toHaveBeenCalled()
    expect(localStorage.getItem('squadmeet.push-onboarding.7')).toBe('later')
  })

  it('stays hidden when Push is not configured on the server', async () => {
    supportPush()
    const { container } = await renderOnboarding(
      vi.fn(async () => Response.json({ enabled: false, public_key: null })),
    )

    expect(container.textContent).toBe('')
  })

  // SCRUM-147: the shared Dialog; Escape means "Später".
  it('is a modal dialog, and Escape means "Später"', async () => {
    supportPush()
    const { container, onConfigure } = await renderOnboarding(
      vi.fn(async () => Response.json({ enabled: true, public_key: 'AQID' })),
    )
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true')

    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

    expect(container.textContent).toBe('')
    expect(onConfigure).not.toHaveBeenCalled()
    expect(localStorage.getItem('squadmeet.push-onboarding.7')).toBe('later')
  })
})
