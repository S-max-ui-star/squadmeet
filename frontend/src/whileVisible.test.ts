import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pageVisible, whileVisible } from './whileVisible'

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

beforeEach(() => {
  vi.useFakeTimers()
  setVisibility('visible')
})

afterEach(() => {
  vi.useRealTimers()
  setVisibility('visible')
})

describe('whileVisible', () => {
  it('repeats while the page is visible', () => {
    const run = vi.fn()
    const stop = whileVisible(run, 1000)
    vi.advanceTimersByTime(3000)
    expect(run).toHaveBeenCalledTimes(3)
    stop()
  })

  it('sends nothing while the page is in the background', () => {
    const run = vi.fn()
    const stop = whileVisible(run, 1000)
    setVisibility('hidden')
    vi.advanceTimersByTime(5000)
    expect(run).not.toHaveBeenCalled()
    stop()
  })

  it('runs once when the page comes back to the front', () => {
    const run = vi.fn()
    const stop = whileVisible(run, 60_000)
    setVisibility('hidden')
    setVisibility('visible')
    expect(run).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does nothing after stop', () => {
    const run = vi.fn()
    const stop = whileVisible(run, 1000)
    stop()
    vi.advanceTimersByTime(3000)
    setVisibility('hidden')
    setVisibility('visible')
    expect(run).not.toHaveBeenCalled()
  })
})

describe('pageVisible', () => {
  it('follows the visibility state', () => {
    expect(pageVisible()).toBe(true)
    setVisibility('hidden')
    expect(pageVisible()).toBe(false)
  })
})
