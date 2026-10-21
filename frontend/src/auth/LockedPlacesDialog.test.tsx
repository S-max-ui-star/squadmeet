import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LockedPlacesDialog from './LockedPlacesDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const locked = [
  { id: 7, name: 'Korbanlage', activity_type: 'basketball', address: null, locked_at: '2026-10-13T10:00:00Z' },
]

describe('LockedPlacesDialog (SCRUM-39)', () => {
  it('lists the locked Places and unlocks one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(locked)))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const onUnlocked = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)

    await act(async () =>
      createRoot(container).render(<LockedPlacesDialog token="t" onUnlocked={onUnlocked} onClose={() => {}} />),
    )
    expect(container.textContent).toContain('Korbanlage')

    const unlock = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Entsperren')!
    await act(async () => unlock.click())

    expect(fetchMock).toHaveBeenLastCalledWith('/api/admin/places/7/unlock', {
      method: 'POST',
      headers: { Authorization: 'Bearer t' },
    })
    expect(onUnlocked).toHaveBeenCalled()
    expect(container.textContent).toContain('Kein Platz ist gesperrt.')
  })

  // SCRUM-109: the Admin dialogs use the shared Dialog: modal, × and Escape close it.
  it('is a modal dialog that closes with × and with Escape', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json([])))
    const onClose = vi.fn()
    const container = document.createElement('div')
    document.body.append(container)
    await act(async () => createRoot(container).render(<LockedPlacesDialog token="t" onUnlocked={() => {}} onClose={onClose} />))

    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    await act(async () => container.querySelector<HTMLButtonElement>('.dialog-close')!.click())
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))

    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
