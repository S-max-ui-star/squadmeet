import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import MapToolbar from './MapToolbar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

async function render(incomingRequests = 0) {
  const handlers = { onContacts: vi.fn(), onFavorites: vi.fn(), onHomeArea: vi.fn(), onMyMeetups: vi.fn() }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<MapToolbar incomingRequests={incomingRequests} {...handlers} />))
  return { container, handlers }
}

const byLabel = (container: HTMLElement, label: string) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label^="${label}"]`)!

describe('MapToolbar (SCRUM-85)', () => {
  it('has four icon buttons with a label and a tooltip', async () => {
    const { container } = await render()

    for (const [label, icon] of [
      ['Kontakte', '👤'],
      ['Favoriten', '⭐'],
      ['Heimatbereich', '📍'],
      ['Meine Treffen', '🤝'],
    ]) {
      const button = byLabel(container, label)
      expect(button.textContent).toContain(icon)
      expect(button.title).toBe(label)
    }
  })

  it('opens the same dialogs as the Konto dialog did', async () => {
    const { container, handlers } = await render()

    await act(async () => byLabel(container, 'Kontakte').click())
    await act(async () => byLabel(container, 'Favoriten').click())
    await act(async () => byLabel(container, 'Heimatbereich').click())

    expect(handlers.onContacts).toHaveBeenCalledOnce()
    expect(handlers.onFavorites).toHaveBeenCalledOnce()
    expect(handlers.onHomeArea).toHaveBeenCalledOnce()
  })

  it('opens "Meine Treffen" (SCRUM-102)', async () => {
    const { container, handlers } = await render()

    await act(async () => byLabel(container, 'Meine Treffen').click())

    expect(handlers.onMyMeetups).toHaveBeenCalledOnce()
  })

  it('shows waiting Contact requests on the person icon', async () => {
    const { container } = await render(2)

    const contacts = byLabel(container, 'Kontakte')
    expect(contacts.getAttribute('aria-label')).toBe('Kontakte, 2 neue Anfragen')
    expect(contacts.textContent).toContain('2')
  })
})
