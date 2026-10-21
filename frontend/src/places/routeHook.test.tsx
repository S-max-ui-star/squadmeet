import { act, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePath } from './route'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: ReturnType<typeof createRoot> | null = null

afterEach(() => {
  if (root) act(() => root?.unmount())
  root = null
  window.history.replaceState(null, '', '/')
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

function renderPath() {
  const container = document.createElement('div')
  document.body.append(container)
  let controls!: ReturnType<typeof usePath>
  function Probe() {
    const value = usePath()
    useEffect(() => { controls = value }, [value])
    return <span>{value[0]}</span>
  }
  root = createRoot(container)
  act(() => root?.render(<Probe />))
  return { container, controls: () => controls }
}

describe('usePath', () => {
  it('returns to the map history entry after a Place was opened there', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const view = renderPath()

    act(() => view.controls()[1]('/platz/7'))
    expect(view.container.textContent).toBe('/platz/7')
    act(() => view.controls()[2]())

    expect(back).toHaveBeenCalledOnce()
  })

  it('closes a direct Place URL by replacing it with the map', () => {
    window.history.replaceState(null, '', '/platz/7')
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})
    const view = renderPath()

    act(() => view.controls()[2]())

    expect(back).not.toHaveBeenCalled()
    expect(window.location.pathname).toBe('/')
    expect(view.container.textContent).toBe('/')
  })

  it('keeps one map history entry when another Place replaces the open one', () => {
    const view = renderPath()
    act(() => view.controls()[1]('/platz/7'))
    act(() => view.controls()[1]('/platz/8'))
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {})

    act(() => view.controls()[2]())

    expect(window.location.pathname).toBe('/platz/8')
    expect(back).toHaveBeenCalledOnce()
  })
})
