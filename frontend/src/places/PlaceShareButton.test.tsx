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
})
