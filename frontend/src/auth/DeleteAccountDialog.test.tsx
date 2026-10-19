import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import DeleteAccountDialog from './DeleteAccountDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

const user = { id: 1, nickname: 'Pingpong_Paula', avatar: 'fox', mfa_enabled: false, is_admin: false }

function render(mfaEnabled: boolean) {
  const container = document.createElement('div')
  document.body.append(container)
  act(() =>
    createRoot(container).render(
      <DeleteAccountDialog
        token="t"
        user={{ ...user, mfa_enabled: mfaEnabled }}
        onDeleted={() => {}}
        onClose={() => {}}
      />,
    ),
  )
  return container
}

describe('DeleteAccountDialog', () => {
  it('asks only for the password when MFA is off', () => {
    const container = render(false)

    expect(container.querySelectorAll('input:not([autocomplete="username"])')).toHaveLength(1)
    expect(container.textContent).toContain('Pingpong_Paula')
  })

  it('asks for a code as well when MFA is on', () => {
    expect(render(true).querySelectorAll('input:not([autocomplete="username"])')).toHaveLength(2)
  })

  it('links the privacy page', () => {
    expect(render(false).querySelector('a[href="/datenschutz"]')).not.toBeNull()
  })
})
