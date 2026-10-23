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

async function render({ loggedIn = true, incomingRequests = 0, activeFilters = 0 } = {}) {
  const handlers = {
    onFilter: vi.fn(),
    onLogin: vi.fn(),
    onMyMeetups: vi.fn(),
    onFavorites: vi.fn(),
    onContacts: vi.fn(),
  }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () =>
    root.render(
      <BottomNav
        loggedIn={loggedIn}
        incomingRequests={incomingRequests}
        activeFilters={activeFilters}
        {...handlers}
      />,
    ),
  )
  return { container, handlers }
}

const buttons = (container: HTMLElement) => [...container.querySelectorAll<HTMLButtonElement>('nav button')]
const byText = (container: HTMLElement, text: string) => buttons(container).find((b) => b.textContent?.includes(text))!

describe('BottomNav (SCRUM-165, SCRUM-175)', () => {
  it('shows four items with icon and visible label, in thumb order; "Filter" replaces "Karte"', async () => {
    const { container } = await render()

    expect(container.querySelector('nav')?.getAttribute('aria-label')).toBe('Hauptnavigation')
    expect(buttons(container).map((b) => b.textContent)).toEqual([
      '🎚️Filter',
      '🤝Treffen',
      '⭐Favoriten',
      '👤Kontakte',
    ])
  })

  it('shows only "Filter" and "Anmelden" to a visitor', async () => {
    const { container, handlers } = await render({ loggedIn: false })

    expect(buttons(container).map((b) => b.textContent)).toEqual(['🎚️Filter', '🔑Anmelden'])
    await act(async () => byText(container, 'Anmelden').click())
    expect(handlers.onLogin).toHaveBeenCalledOnce()
  })

  it('names each item so the visible label is part of the name', async () => {
    const { container } = await render()

    expect(byText(container, 'Treffen').getAttribute('aria-label')).toBe('Meine Treffen')
    expect(byText(container, 'Filter').getAttribute('aria-label')).toBe('Filter')
    expect(container.querySelector('[aria-current]')).toBeNull()
  })

  it('opens the filter sheet and the same dialogs as the MapToolbar', async () => {
    const { container, handlers } = await render()

    for (const text of ['Filter', 'Treffen', 'Favoriten', 'Kontakte']) {
      await act(async () => byText(container, text).click())
    }

    expect(handlers.onFilter).toHaveBeenCalledOnce()
    expect(handlers.onMyMeetups).toHaveBeenCalledOnce()
    expect(handlers.onFavorites).toHaveBeenCalledOnce()
    expect(handlers.onContacts).toHaveBeenCalledOnce()
  })

  it('shows a badge on "Filter" while a filter differs from the default', async () => {
    const { container } = await render({ activeFilters: 2 })

    const filter = byText(container, 'Filter')
    expect(filter.getAttribute('aria-label')).toBe('Filter, 2 aktiv')
    expect(filter.querySelector('.filter-count')?.textContent).toBe('2')
  })

  it('shows no filter badge for the default filters', async () => {
    const { container } = await render({ loggedIn: false })

    expect(container.querySelector('.filter-count')).toBeNull()
  })

  it('shows waiting Contact requests on Kontakte', async () => {
    const { container } = await render({ incomingRequests: 2 })

    const contacts = byText(container, 'Kontakte')
    expect(contacts.getAttribute('aria-label')).toBe('Kontakte, 2 neue Anfragen')
    expect(contacts.querySelector('.notification-count')?.textContent).toBe('2')
  })

  it('has no Home area: it is in Konto (SCRUM-169)', async () => {
    const { container } = await render()

    expect(buttons(container).some((b) => b.textContent?.includes('Heimat'))).toBe(false)
  })

  it('shows no count without requests', async () => {
    const { container } = await render()

    expect(container.querySelector('.notification-count')).toBeNull()
  })
})
