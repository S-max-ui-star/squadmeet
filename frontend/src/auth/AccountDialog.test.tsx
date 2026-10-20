import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import AccountDialog from './AccountDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const admin = { id: 1, nickname: 'Steven', avatar: 'fox', is_admin: true, mfa_enabled: true }
const none = () => {}

afterEach(() => {
  document.body.innerHTML = ''
})

async function render(photos: boolean) {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () =>
    createRoot(container).render(
      <AccountDialog
        user={admin}
        incomingRequests={0}
        photos={photos}
        onContacts={none}
        onFavorites={none}
        onHomeArea={none}
        onPush={none}
        onMfa={none}
        onDelete={none}
        onLockedPlaces={none}
        onSuggestions={none}
        onReports={none}
        onPhotos={none}
        onClose={none}
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
})
