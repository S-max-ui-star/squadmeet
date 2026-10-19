import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import type { User } from '../api/auth'
import RecoveryCodesDialog from './RecoveryCodesDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const user: User = { id: 1, nickname: 'Pingpong_Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }

afterEach(() => {
  document.body.innerHTML = ''
})

function render(mfaEnabled: boolean) {
  const container = document.createElement('div')
  document.body.append(container)
  act(() =>
    createRoot(container).render(
      <RecoveryCodesDialog token="t" user={{ ...user, mfa_enabled: mfaEnabled }} onClose={() => {}} />,
    ),
  )
  return container
}

describe('RecoveryCodesDialog (SCRUM-33)', () => {
  it('asks only for the password when MFA is off', () => {
    expect(render(false).querySelectorAll('input:not([autocomplete="username"])')).toHaveLength(1)
  })

  it('asks for the password and a code when MFA is on', () => {
    expect(render(true).querySelectorAll('input:not([autocomplete="username"])')).toHaveLength(2)
  })
})
