import { act, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { User } from '../api/auth'
import DeleteAccountDialog from './DeleteAccountDialog'
import MfaDialog from './MfaDialog'
import RecoveryCodesDialog from './RecoveryCodesDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const user: User = { id: 1, nickname: 'Pingpong_Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }

afterEach(() => {
  document.body.innerHTML = ''
})

function render(node: ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  act(() => createRoot(container).render(node))
  return container
}

const noop = () => {}

// Safari fills a saved password only next to a username field (SCRUM-91). These dialogs ask
// a signed-in user for the password, so the form carries the nickname as that field.
const dialogs: [string, (mfaEnabled: boolean) => ReactNode][] = [
  ['MfaDialog', (mfa) => (
    <MfaDialog token="t" user={{ ...user, mfa_enabled: mfa }} onChanged={noop} onNewRecoveryCodes={noop} onClose={noop} />
  )],
  ['RecoveryCodesDialog', (mfa) => (
    <RecoveryCodesDialog token="t" user={{ ...user, mfa_enabled: mfa }} onClose={noop} />
  )],
  ['DeleteAccountDialog', (mfa) => (
    <DeleteAccountDialog token="t" user={{ ...user, mfa_enabled: mfa }} onDeleted={noop} onClose={noop} />
  )],
]

describe('password forms of a signed-in user (SCRUM-91)', () => {
  describe.each(dialogs)('%s', (_, dialog) => {
    it.each([false, true])('has a username field with the nickname before the password (MFA %s)', (mfa) => {
      const form = render(dialog(mfa)).querySelector('form')!
      const username = form.querySelector<HTMLInputElement>('input[autocomplete="username"]')
      const password = form.querySelector<HTMLInputElement>('input[type="password"]')!

      expect(username?.value).toBe('Pingpong_Paula')
      expect(username!.readOnly).toBe(true)
      expect(username!.tabIndex).toBe(-1)
      expect(username!.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(password.autocomplete).toBe('current-password')
    })
  })
})
