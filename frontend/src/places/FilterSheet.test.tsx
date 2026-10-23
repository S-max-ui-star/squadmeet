import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TimeSpan } from '../api/meetups'
import { ACTIVITY_TYPES, type ActivityType } from './activities'
import FilterSheet from './FilterSheet'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  document.body.innerHTML = ''
})

function render(span: TimeSpan | null = null, chosen: Set<ActivityType> = new Set(ACTIVITY_TYPES)) {
  const handlers = { onSpanChange: vi.fn(), onChosenChange: vi.fn(), onClose: vi.fn() }
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  act(() => root.render(<FilterSheet span={span} chosen={chosen} {...handlers} />))
  return { container, handlers }
}

const group = (container: HTMLElement, label: string) =>
  [...container.querySelectorAll<HTMLButtonElement>(`[role="group"][aria-label="${label}"] button`)]

describe('FilterSheet (SCRUM-175)', () => {
  it('is a dialog named "Filter" with the four Time choices and the five activities', () => {
    const { container } = render()

    const dialog = container.querySelector('[role="dialog"]')!
    expect(dialog.classList).toContain('filter-sheet')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent).toBe('Filter')
    expect(group(container, 'Treffen nach Zeit filtern').map((b) => b.textContent)).toEqual([
      'Jetzt',
      '3 h',
      '6 h',
      'Heute',
    ])
    expect(group(container, 'Aktivitäten filtern')).toHaveLength(ACTIVITY_TYPES.length)
  })

  it('shows the current filters as pressed', () => {
    const { container } = render('6h', new Set<ActivityType>(['football']))

    const pressed = (label: string) =>
      group(container, label).filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent)
    expect(pressed('Treffen nach Zeit filtern')).toEqual(['6 h'])
    expect(pressed('Aktivitäten filtern')).toEqual(['⚽ Fußball'])
  })

  it('changes the filters at once, so the map behind it changes too', () => {
    const { container, handlers } = render()

    act(() => group(container, 'Treffen nach Zeit filtern')[0].click())
    act(() => group(container, 'Aktivitäten filtern')[1].click())

    expect(handlers.onSpanChange).toHaveBeenCalledWith('now')
    const next: Set<ActivityType> = handlers.onChosenChange.mock.calls[0][0]
    expect(next.has(ACTIVITY_TYPES[1])).toBe(false)
    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  it('closes with × and with Escape', () => {
    const { container, handlers } = render()

    act(() => container.querySelector<HTMLButtonElement>('.dialog-close')!.click())
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })

    expect(handlers.onClose).toHaveBeenCalledTimes(2)
  })
})
