import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/auth'
import MfaDialog from './MfaDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots = new Set<Root>()

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const user = { id: 1, nickname: 'Pingpong_Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }
const setup = { secret: 'ABC', otpauth_uri: 'otpauth://totp/x', qr_code: 'data:image/svg+xml,x' }

function render(
  fetchMock: ReturnType<typeof vi.fn>,
  options: { mfaEnabled?: boolean; onChanged?: (user: User) => void } = {},
) {
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  const onChanged = options.onChanged ?? vi.fn()
  act(() =>
    root.render(
      <MfaDialog
        token="t"
        user={{ ...user, mfa_enabled: options.mfaEnabled ?? false }}
        onChanged={onChanged}
        onNewRecoveryCodes={() => {}}
        onClose={() => {}}
      />,
    ),
  )
  return { container, root }
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)

describe('MfaDialog', () => {
  it('asks for the password before it turns MFA on (review SCRUM-68)', async () => {
    const fetchMock = vi.fn(async () => Response.json(setup))
    const { container } = render(fetchMock)
    const input = container.querySelector<HTMLInputElement>('input[type="password"]')!

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'geheim-123')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button(container, 'Einschalten')!.click())

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/auth/mfa/setup')
    expect(JSON.parse(init.body as string)).toEqual({ password: 'geheim-123' })
    expect(container.querySelector('img.mfa-qr')).not.toBeNull()
  })

  it('does not apply a response after its workflow was unmounted', async () => {
    let resolve!: (response: Response) => void
    const fetchMock = vi.fn(() => new Promise<Response>((done) => { resolve = done }))
    const onChanged = vi.fn()
    const { container, root } = render(fetchMock, { mfaEnabled: true, onChanged })
    const inputs = container.querySelectorAll<HTMLInputElement>('input')

    await act(async () => {
      for (const input of inputs) {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'secret')
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
      button(container, 'Ausschalten')!.click()
    })
    expect(button(container, 'Schließen')!.disabled).toBe(true)
    await act(async () => root.unmount())
    roots.delete(root)
    await act(async () => resolve(Response.json({ ...user, mfa_enabled: false })))

    expect(onChanged).not.toHaveBeenCalled()
  })
})
