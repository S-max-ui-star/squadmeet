import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MfaDialog from './MfaDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const user = { id: 1, nickname: 'Pingpong_Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }
const setup = { secret: 'ABC', otpauth_uri: 'otpauth://totp/x', qr_code: 'data:image/svg+xml,x' }

function render(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  act(() =>
    createRoot(container).render(
      <MfaDialog token="t" user={user} onChanged={() => {}} onNewRecoveryCodes={() => {}} onClose={() => {}} />,
    ),
  )
  return container
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)

describe('MfaDialog', () => {
  it('asks for the password before it turns MFA on (review SCRUM-68)', async () => {
    const fetchMock = vi.fn(async () => Response.json(setup))
    const container = render(fetchMock)
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
})
