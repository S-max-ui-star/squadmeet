import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import Dialog from './Dialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

async function render(onClose = vi.fn()) {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () =>
    createRoot(container).render(
      <Dialog title="Kontakte" onClose={onClose}>
        <p>Inhalt</p>
      </Dialog>,
    ),
  )
  return { container, onClose }
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
    expect(container.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Kontakte')
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

  it('stays open when a press starts inside and ends outside (text selection)', async () => {
    const { container, onClose } = await render()

    await act(async () => click(container.querySelector('.dialog-backdrop')!, container.querySelector('p')!))

    expect(onClose).not.toHaveBeenCalled()
  })
})
