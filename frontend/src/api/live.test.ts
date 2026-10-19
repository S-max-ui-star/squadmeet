import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectLive, type LiveTopic } from './live'

// A stream body that sends these chunks; it stays open unless `end` is set.
function body(chunks: string[], end = false) {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      if (end) controller.close()
    },
  })
}

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

let onOpen: ReturnType<typeof vi.fn<() => void>>
let onTopic: ReturnType<typeof vi.fn<(topic: LiveTopic) => void>>
let stop: () => void = () => {}

beforeEach(() => {
  vi.useFakeTimers()
  onOpen = vi.fn()
  onTopic = vi.fn()
})

afterEach(() => {
  stop()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('connectLive', () => {
  it('opens the stream with the login and reports ready and each topic', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(body(['data: rea', 'dy\n\n: ping\n\ndata: contacts\n\n', 'data: notifications\n\n'])))
    vi.stubGlobal('fetch', fetch)

    stop = connectLive('t', { onOpen, onTopic })
    await vi.waitFor(() => expect(onTopic).toHaveBeenCalledTimes(2))

    expect(fetch).toHaveBeenCalledWith('/api/live', expect.objectContaining({ headers: { Authorization: 'Bearer t' } }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(onTopic.mock.calls).toEqual([['contacts'], ['notifications']])
  })

  it('connects again after the stream ends, and then reports ready again', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(body(['data: ready\n\n'], true)))
      .mockResolvedValueOnce(new Response(body(['data: ready\n\n'])))
    vi.stubGlobal('fetch', fetch)

    stop = connectLive('t', { onOpen, onTopic })
    // Not vi.waitFor here: it moves the fake clock forward.
    await vi.advanceTimersByTimeAsync(0)
    expect(onOpen).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1_999)
    expect(fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2))
  })

  it('waits longer after each failed try', async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError('offline'))
    vi.stubGlobal('fetch', fetch)

    stop = connectLive('t', { onOpen, onTopic })
    await vi.advanceTimersByTimeAsync(2_000)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(3_999)
    expect(fetch).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetch).toHaveBeenCalledTimes(3)
  })

  it('stops for good when the login is no longer valid', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetch)

    stop = connectLive('t', { onOpen, onTopic })
    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('opens a fresh stream at once when the page becomes visible again', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(body(['data: ready\n\n']))))
    vi.stubGlobal('fetch', fetch)
    stop = connectLive('t', { onOpen, onTopic })
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))
    const firstSignal: AbortSignal = fetch.mock.calls[0][1].signal

    setVisibility('hidden')
    setVisibility('visible')

    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(2))
    expect(firstSignal.aborted).toBe(true)
  })

  it('stop closes the stream and does not connect again', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(body(['data: ready\n\n']))))
    vi.stubGlobal('fetch', fetch)
    stop = connectLive('t', { onOpen, onTopic })
    await vi.waitFor(() => expect(onOpen).toHaveBeenCalledTimes(1))

    stop()
    setVisibility('visible')
    await vi.advanceTimersByTimeAsync(60_000)

    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})
