import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dialog from './Dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots = new Set<ReturnType<typeof createRoot>>()

afterEach(async () => {
  await act(async () => {
    for (const root of roots) root.unmount()
  })
  roots.clear()
  document.body.innerHTML = ''
})

async function render(onClose = vi.fn()) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  await act(async () =>
    root.render(
      <Dialog title="Kontakte" onClose={onClose}>
        <p>Inhalt</p>
        <button type="button">Speichern</button>
      </Dialog>,
    ),
  )
  return { container, onClose, root }
}

// A real click: press and release on the same element.
function click(element: Element, pressOn = element) {
  pressOn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}

describe('Dialog', () => {
  it('shows the title as heading and dialog name', async () => {
    const { container } = await render()

    expect(container.querySelector('h2')?.textContent).toBe('Kontakte')
    const dialog = container.querySelector('[role="dialog"]')!
    const title = container.querySelector('h2')!
    expect(dialog.getAttribute('aria-labelledby')).toBe(title.id)
    expect(dialog.getAttribute('aria-modal')).toBe('true')
  })

  it('moves focus into the dialog when it opens', async () => {
    const { container } = await render()

    expect(document.activeElement).toBe(container.querySelector('button[aria-label="Schließen"]'))
  })

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const { container } = await render()
    const close = container.querySelector('button[aria-label="Schließen"]') as HTMLButtonElement
    const save = Array.from(container.querySelectorAll('button')).find(
      (button) => button.textContent === 'Speichern',
    )!

    save.focus()
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })))
    expect(document.activeElement).toBe(close)

    close.focus()
    await act(async () =>
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true })),
    )
    expect(document.activeElement).toBe(save)
  })

  it('closes with Escape', async () => {
    const { onClose } = await render()

    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('restores focus to the opener when it closes', async () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { root } = await render()

    await act(async () => root.unmount())
    roots.delete(root)

    expect(document.activeElement).toBe(opener)
  })

  it('closes with the × at the top', async () => {
    const { container, onClose } = await render()

    await act(async () => click(container.querySelector('button[aria-label="Schließen"]')!))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on a click outside the window', async () => {
    const { container, onClose } = await render()

    await act(async () => click(container.querySelector('.dialog-backdrop')!))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('stays open on a click inside the window', async () => {
    const { container, onClose } = await render()

    await act(async () => click(container.querySelector('p')!))

    expect(onClose).not.toHaveBeenCalled()
  })

  // SCRUM-168: on a phone the dialog is a sheet at the bottom; the keyboard must not cover it.
  it('keeps the bottom sheet above the virtual keyboard', async () => {
    const viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0 })
    vi.stubGlobal('visualViewport', viewport)
    try {
      const { container } = await render()
      const backdrop = container.querySelector<HTMLElement>('.dialog-backdrop')!
      expect(backdrop.style.getPropertyValue('--keyboard-inset')).toBe('0px')

      viewport.height = window.innerHeight - 300
      await act(async () => viewport.dispatchEvent(new Event('resize')))
      expect(backdrop.style.getPropertyValue('--keyboard-inset')).toBe('300px')

      viewport.height = window.innerHeight
      await act(async () => viewport.dispatchEvent(new Event('resize')))
      expect(backdrop.style.getPropertyValue('--keyboard-inset')).toBe('0px')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('stays open when a press starts inside and ends outside (text selection)', async () => {
    const { container, onClose } = await render()

    await act(async () => click(container.querySelector('.dialog-backdrop')!, container.querySelector('p')!))

    expect(onClose).not.toHaveBeenCalled()
  })
})
