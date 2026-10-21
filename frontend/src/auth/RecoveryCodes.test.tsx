import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import RecoveryCodes from './RecoveryCodes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  root = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function render(onConfirmed = vi.fn()) {
  const opener = document.createElement('button')
  document.body.append(opener)
  opener.focus()
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root?.render(
    <RecoveryCodes codes={['AAAA-BBBB', 'CCCC-DDDD']} onConfirmed={onConfirmed} />,
  ))
  return { container, onConfirmed, opener }
}

function clipboard(value: { writeText: ReturnType<typeof vi.fn> } | undefined) {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value })
}

describe('RecoveryCodes', () => {
  it('is a labelled modal that cannot be dismissed before confirmation', async () => {
    const { container, onConfirmed } = await render()
    const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!

    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)?.textContent)
      .toBe('Deine Wiederherstellungscodes')
    expect(container.querySelector('[aria-label="Schließen"]')).toBeNull()

    const copy = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Codes kopieren',
    )!
    const saved = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!
    copy.focus()
    await act(async () => document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }),
    ))
    expect(document.activeElement).toBe(saved)

    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })))
    expect(onConfirmed).not.toHaveBeenCalled()
  })

  it('copies the codes and confirms success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    clipboard({ writeText })
    const { container } = await render()

    await act(async () => {
      ;([...container.querySelectorAll('button')].find((button) => button.textContent === 'Codes kopieren'))!.click()
    })

    expect(writeText).toHaveBeenCalledWith('AAAA-BBBB\nCCCC-DDDD')
    expect(container.querySelector('[role="status"]')?.textContent).toBe('Codes kopiert.')
  })

  it.each([
    ['is unavailable', undefined],
    ['rejects', { writeText: vi.fn().mockRejectedValue(new Error('denied')) }],
  ])('offers manual copying when Clipboard %s', async (_, api) => {
    clipboard(api)
    const { container } = await render()

    await act(async () => {
      ;([...container.querySelectorAll('button')].find((button) => button.textContent === 'Codes kopieren'))!.click()
    })

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('kopiere sie von Hand')
    expect(container.textContent).toContain('AAAA-BBBB')
  })

  it('requires the explicit saved confirmation before continuing', async () => {
    const { container, onConfirmed } = await render()
    const next = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Weiter')!
    const checkbox = container.querySelector<HTMLInputElement>('input[type="checkbox"]')!

    expect(next.disabled).toBe(true)
    await act(async () => {
      checkbox.click()
      next.click()
    })
    expect(onConfirmed).toHaveBeenCalledOnce()
  })
})
