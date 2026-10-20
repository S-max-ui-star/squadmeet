import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import AccountDialog from './AccountDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const admin = { id: 1, nickname: 'Steven', avatar: 'fox', is_admin: true, mfa_enabled: true }
const none = () => {}

afterEach(() => {
  document.body.innerHTML = ''
})

async function render(photos: boolean, onClose = none) {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () =>
    createRoot(container).render(
      <AccountDialog
        user={admin}
        photos={photos}
        onPush={none}
        onMfa={none}
        onDelete={none}
        onLockedPlaces={none}
        onSuggestions={none}
        onReports={none}
        onPhotos={none}
        onClose={onClose}
      />,
    ),
  )
  return [...container.querySelectorAll('button')].map((b) => b.textContent)
}

describe('AccountDialog', () => {
  it('offers "Fotos freigeben" to an Admin while Photos are on', async () => {
    expect(await render(true)).toContain('Fotos freigeben')
  })

  it('hides "Fotos freigeben" while Photos are off (SCRUM-94)', async () => {
    const buttons = await render(false)

    expect(buttons).not.toContain('Fotos freigeben')
    expect(buttons).toContain('Gemeldete Plätze')
  })

  it('no longer holds Contacts, Favorites and Home area: they are in the toolbar (SCRUM-85)', async () => {
    const buttons = await render(true)

    for (const text of ['Kontakte', 'Favoriten', 'Heimatbereich']) {
      expect(buttons.some((b) => b?.startsWith(text))).toBe(false)
    }
  })

  it('closes with the × at the top, as the Place panel (SCRUM-85)', async () => {
    const onClose = vi.fn()
    await render(true, onClose)

    await act(async () => document.querySelector<HTMLButtonElement>('.dialog-close')!.click())

    expect(onClose).toHaveBeenCalledOnce()
  })
})
