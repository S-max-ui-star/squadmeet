import { act, useEffect } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useFocusRequest, type FocusRequest } from './focus'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
let current: FocusRequest | null
let focusOn: (id: number) => void

function Probe() {
  const [focus, focusOnPlace] = useFocusRequest()
  useEffect(() => {
    current = focus
    focusOn = focusOnPlace
  })
  return null
}

function mount() {
  act(() => root.render(<Probe />))
}

beforeEach(() => {
  container = document.createElement('div')
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  window.history.replaceState(null, '', '/')
})

describe('useFocusRequest', () => {
  it('has no request on a normal start', () => {
    window.history.replaceState(null, '', '/platz/3')
    mount()
    expect(current).toBeNull()
  })

  it('asks to focus the Place when a web push opened the page', () => {
    window.history.replaceState(null, '', '/platz/3#treffen-9')
    mount()
    expect(current?.id).toBe(3)
  })

  it('asks again when a web push changes only the hash', () => {
    window.history.replaceState(null, '', '/platz/3')
    mount()
    act(() => {
      window.history.replaceState(null, '', '/platz/3#treffen-9')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(current?.id).toBe(3)
  })

  it('gives each tap a new request, also for the same Place', () => {
    mount()
    act(() => focusOn(5))
    const first = current
    act(() => focusOn(5))
    expect(current?.id).toBe(5)
    expect(current?.request).not.toBe(first?.request)
  })
})
