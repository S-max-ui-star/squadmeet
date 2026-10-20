import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPhotosEnabled } from './photos'

afterEach(() => {
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

// The switch PHOTOS_ENABLED (SCRUM-94): Photos are deferred.
describe('fetchPhotosEnabled', () => {
  it('is true when the server has Photos on', async () => {
    const fetch = vi.fn().mockResolvedValue(json({ enabled: true }))
    vi.stubGlobal('fetch', fetch)

    expect(await fetchPhotosEnabled()).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/api/photos/config')
  })

  it('is false when the server has Photos off', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ enabled: false })))

    expect(await fetchPhotosEnabled()).toBe(false)
  })

  it('is false when the server does not answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ detail: 'Not Found' }, 404)))
    expect(await fetchPhotosEnabled()).toBe(false)

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')))
    expect(await fetchPhotosEnabled()).toBe(false)
  })
})
