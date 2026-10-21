import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CaptchaRequiredError,
  login,
  MfaRequiredError,
  register,
  resetPassword,
} from '../api/auth'
import AuthDialog from './AuthDialog'

vi.mock('../api/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/auth')>()),
  login: vi.fn(),
  register: vi.fn(),
  resetPassword: vi.fn(),
}))

vi.mock('./Turnstile', () => ({
  default: ({ onToken }: { onToken: (token: string) => void }) => (
    <button type="button" data-testid="turnstile" onClick={() => onToken('captcha-token')}>
      Captcha lösen
    </button>
  ),
}))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const result = {
  token: 'session',
  user: { id: 1, nickname: 'Paula', avatar: 'fox', mfa_enabled: false, is_admin: false },
}
const roots = new Set<Root>()

beforeEach(() => vi.clearAllMocks())
afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.innerHTML = ''
})

async function renderDialog() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  const onLoggedIn = vi.fn()
  const onClose = vi.fn()
  await act(async () => root.render(<AuthDialog onLoggedIn={onLoggedIn} onClose={onClose} />))
  return { container, root, onLoggedIn, onClose }
}

function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((item) => item.textContent === text)!
}

async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function submit(container: HTMLElement) {
  await act(async () => container.querySelector('form')!.dispatchEvent(
    new SubmitEvent('submit', { bubbles: true, cancelable: true }),
  ))
}

describe('AuthDialog', () => {
  it('uses the shared form-dialog keyboard behavior', async () => {
    const { container, onClose } = await renderDialog()
    const form = container.querySelector('form')!
    const close = container.querySelector<HTMLButtonElement>('[aria-label="Schließen"]')!
    const lastLink = [...container.querySelectorAll('a')].at(-1)!

    expect(form.getAttribute('role')).toBe('dialog')
    lastLink.focus()
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' })))
    expect(document.activeElement).toBe(close)
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('logs in and handles an MFA-required retry', async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new MfaRequiredError())
      .mockResolvedValueOnce(result)
    const { container, onLoggedIn } = await renderDialog()
    await input(container.querySelector('input[autocomplete="username"]')!, 'Paula')
    await input(container.querySelector('input[type="password"]')!, 'secret-123')

    await submit(container)
    const code = container.querySelector<HTMLInputElement>('input[autocomplete="one-time-code"]')!
    expect(code).not.toBeNull()
    await input(code, '123456')
    await submit(container)

    expect(login).toHaveBeenLastCalledWith('Paula', 'secret-123', '123456', undefined)
    expect(onLoggedIn).toHaveBeenCalledWith(result)
  })

  it('registers after changing mode and completing the captcha', async () => {
    vi.mocked(register).mockResolvedValue({ ...result, recovery_codes: ['AAAA-BBBB'] })
    const { container } = await renderDialog()
    await act(async () => button(container, 'Noch kein Konto? Registrieren').click())
    await input(container.querySelector('input[autocomplete="username"]')!, 'Paula')
    await input(container.querySelector('input[type="password"]')!, 'secret-123')
    await act(async () => {
      container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
      button(container, 'Captcha lösen').click()
    })
    await submit(container)

    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      nickname: 'Paula',
      password: 'secret-123',
      is_adult: true,
      turnstile_token: 'captcha-token',
    }))
    expect(container.textContent).toContain('Deine Wiederherstellungscodes')
  })

  it('resets the password from its mode', async () => {
    vi.mocked(resetPassword).mockResolvedValue(result)
    const { container, onLoggedIn } = await renderDialog()
    await act(async () => button(container, 'Passwort vergessen?').click())
    const fields = container.querySelectorAll<HTMLInputElement>('input')
    await input(fields[0], 'Paula')
    await input(fields[1], 'AAAA-BBBB')
    await input(fields[2], 'new-secret')
    await act(async () => button(container, 'Captcha lösen').click())
    await submit(container)

    expect(resetPassword).toHaveBeenCalledWith({
      nickname: 'Paula', code: 'AAAA-BBBB', new_password: 'new-secret', turnstile_token: 'captcha-token',
    })
    expect(onLoggedIn).toHaveBeenCalledWith(result)
  })

  it('mounts a fresh captcha after a rejected captcha-protected login', async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new CaptchaRequiredError())
      .mockRejectedValueOnce(new Error('Falsches Passwort'))
    const { container } = await renderDialog()
    await submit(container)
    const firstWidget = button(container, 'Captcha lösen')
    await act(async () => firstWidget.click())
    await submit(container)

    expect(login).toHaveBeenLastCalledWith('', '', undefined, 'captcha-token')
    expect(button(container, 'Captcha lösen')).not.toBe(firstWidget)
  })

  it('locks navigation while pending and ignores a response after unmount', async () => {
    let resolve!: (value: typeof result) => void
    vi.mocked(login).mockReturnValue(new Promise((done) => { resolve = done }))
    const { container, root, onLoggedIn } = await renderDialog()
    await submit(container)

    expect(button(container, 'Noch kein Konto? Registrieren').disabled).toBe(true)
    expect(button(container, 'Abbrechen').disabled).toBe(true)
    expect(container.querySelector<HTMLButtonElement>('[aria-label="Schließen"]')!.disabled).toBe(true)
    await act(async () => root.unmount())
    roots.delete(root)
    await act(async () => resolve(result))

    expect(onLoggedIn).not.toHaveBeenCalled()
  })
})
