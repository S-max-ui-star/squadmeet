import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BottomNav from './BottomNav'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

async function render(incomingRequests = 0) {
  const handlers = {
    onMap: vi.fn(),
    onMyMeetups: vi.fn(),
    onFavorites: vi.fn(),
    onContacts: vi.fn(),
    onHomeArea: vi.fn(),
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () => root.render(<BottomNav incomingRequests={incomingRequests} {...handlers} />))
  return { container, handlers }
}

const buttons = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('nav button')]
const byText = (container: HTMLElement, text: string) => buttons(container).find((b) => b.textContent?.includes(text))!

describe('BottomNav (SCRUM-165)', () => {
  it('shows five items with icon and visible label, in thumb order', async () => {
    const { container } = await render()

    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Hauptnavigation')
    expect(buttons(container).map((b) => b.textContent)).toEqual([
      '🗺️Karte',
      '📅Treffen',
      '⭐Favoriten',
      '👤Kontakte',
      '📍Heimat',
    ])
  })

  it('names each item so the visible label is part of the name', async () => {
    const { container } = await render()

    expect(byText(container, 'Treffen').getAttribute('aria-label')).toBe('Meine Treffen')
    expect(byText(container, 'Heimat').getAttribute('aria-label')).toBe('Heimatbereich')
    expect(byText(container, 'Karte').getAttribute('aria-current')).toBe('page')
  })

  it('opens the same dialogs as the MapToolbar, and "Karte" goes back to the map', async () => {
    const { container, handlers } = await render()

    for (const text of ['Karte', 'Treffen', 'Favoriten', 'Kontakte', 'Heimat']) {
      await act(async () => byText(container, text).click())
    }

    expect(handlers.onMap).toHaveBeenCalledOnce()
    expect(handlers.onMyMeetups).toHaveBeenCalledOnce()
    expect(handlers.onFavorites).toHaveBeenCalledOnce()
    expect(handlers.onContacts).toHaveBeenCalledOnce()
    expect(handlers.onHomeArea).toHaveBeenCalledOnce()
  })

  it('shows waiting Contact requests on Kontakte', async () => {
    const { container } = await render(2)

    const contacts = byText(container, 'Kontakte')
    expect(contacts.getAttribute('aria-label')).toBe('Kontakte, 2 neue Anfragen')
    expect(contacts.querySelector('.notification-count')?.textContent).toBe('2')
  })

  it('shows no count without requests', async () => {
    const { container } = await render()

    expect(container.querySelector('.notification-count')).toBeNull()
  })
})
