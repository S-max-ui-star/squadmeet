import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PlaceShareButton from './PlaceShareButton'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function render() {
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  act(() => root!.render(<PlaceShareButton placeId={7} placeName="Korbanlage" />))
  return container.querySelector('button') as HTMLButtonElement
}

describe('PlaceShareButton (SCRUM-95)', () => {
  it('copies the production Place link and confirms it without the Web Share API', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const button = render()

    await act(async () => button.click())

    expect(writeText).toHaveBeenCalledWith('https://squadmeet.duckdns.org/platz/7')
    expect(button.textContent).toBe('Link kopiert')
  })

  it('opens the system share sheet with the Place name and production link when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    vi.stubGlobal('navigator', { share, clipboard: { writeText } })
    const button = render()

    await act(async () => button.click())

    expect(share).toHaveBeenCalledWith({
      title: 'Korbanlage',
      text: 'Korbanlage',
      url: 'https://squadmeet.duckdns.org/platz/7',
    })
    expect(writeText).not.toHaveBeenCalled()
  })

  // SCRUM-163: a refused share sheet (not the user's cancel) falls back to copying the link.
  it('copies the link when the browser refuses the share sheet', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', {
      share: vi.fn(async () => Promise.reject(new DOMException('not allowed', 'NotAllowedError'))),
      clipboard: { writeText },
    })
    const button = render()

    await act(async () => button.click())

    expect(writeText).toHaveBeenCalledWith('https://squadmeet.duckdns.org/platz/7')
    expect(button.textContent).toBe('Link kopiert')
  })

  it('stays quiet when the user closes the share sheet', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', {
      share: vi.fn(async () => Promise.reject(new DOMException('closed', 'AbortError'))),
      clipboard: { writeText },
    })
    const button = render()

    await act(async () => button.click())

    expect(writeText).not.toHaveBeenCalled()
    expect(button.textContent).toBe('Teilen')
  })

  // SCRUM-160: share refused and no clipboard: the user is told, also by a screen reader.
  it('says so when neither sharing nor copying works', async () => {
    vi.stubGlobal('navigator', {
      share: vi.fn(async () => Promise.reject(new DOMException('not allowed', 'NotAllowedError'))),
    })
    const button = render()

    await act(async () => button.click())

    const status = document.querySelector('[role="status"]')!
    expect(status.textContent).toBe('Teilen nicht möglich.')
    expect(button.textContent).toBe('Teilen')
  })

  it('reads a copied link out', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => {}) } })
    const button = render()

    await act(async () => button.click())

    expect(document.querySelector('[role="status"]')!.textContent).toBe('Link kopiert.')
  })
})
