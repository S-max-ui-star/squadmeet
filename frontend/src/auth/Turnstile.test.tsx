import { act, type ComponentType } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

beforeEach(() => {
  vi.resetModules()
  delete window.turnstile
})

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  document.head.querySelectorAll('script[src*="turnstile"]').forEach((script) => script.remove())
  document.body.innerHTML = ''
  delete window.turnstile
  vi.clearAllMocks()
})

async function component(siteKey: string | null = 'site-key') {
  vi.doMock('../api/auth', () => ({ fetchCaptchaSiteKey: vi.fn().mockResolvedValue(siteKey) }))
  return (await import('./Turnstile')).default as ComponentType<{ onToken: (token: string | null) => void }>
}

describe('Turnstile', () => {
  it('loads, forwards callbacks and removes the widget', async () => {
    const renderWidget = vi.fn((
      _container: HTMLElement,
      _options: {
        callback: (token: string) => void
        'expired-callback': () => void
        'error-callback': () => void
      },
    ) => 'widget-1')
    const remove = vi.fn()
    window.turnstile = { render: renderWidget, remove }
    const Turnstile = await component()
    const onToken = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root?.render(<Turnstile onToken={onToken} />))
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="turnstile"]')!

    await act(async () => script.dispatchEvent(new Event('load')))
    const options = renderWidget.mock.calls[0][1]
    options.callback('token')
    options['expired-callback']()
    options['error-callback']()
    expect(onToken.mock.calls).toEqual([['token'], [null], [null]])

    await act(async () => root?.unmount())
    root = null
    expect(remove).toHaveBeenCalledWith('widget-1')
  })

  it('shows an error and removes the failed script so a retry can load it again', async () => {
    const Turnstile = await component()
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () => root?.render(<Turnstile onToken={() => {}} />))
    const script = document.head.querySelector<HTMLScriptElement>('script[src*="turnstile"]')!

    await act(async () => script.dispatchEvent(new Event('error')))

    expect(container.textContent).toContain('Die Bot-Prüfung konnte nicht laden')
    expect(document.head.contains(script)).toBe(false)
  })
})
