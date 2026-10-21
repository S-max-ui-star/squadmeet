import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveToken } from '../api/auth'
import PlacePhotos from './PlacePhotos'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const user = { id: 1, nickname: 'Stefan', avatar: 'fox', is_admin: false, mfa_enabled: false }

const photo = {
  id: 3,
  url: 'https://photos.example/places/7/a.jpg?signed',
  width: 1600,
  height: 1200,
  created_at: '2026-10-16T08:00:00Z',
}

// Unmounted after each test, so an old part does not load again on a later visibility change.
const roots: Root[] = []

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()))
  vi.useRealTimers()
  vi.restoreAllMocks()
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

async function render(props: Partial<Parameters<typeof PlacePhotos>[0]> = {}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push(root)
  await act(async () =>
    root.render(<PlacePhotos placeId={7} user={null} onLoginNeeded={() => {}} {...props} />),
  )
  return container
}

function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

async function choose(container: HTMLElement, file: File) {
  const input = container.querySelector<HTMLInputElement>('input[type=file]')!
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })))
}

describe('PlacePhotos', () => {
  it('shows the approved photos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([photo])))

    const container = await render()

    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe(photo.url)
    expect(img.getAttribute('loading')).toBe('lazy')
  })

  it('says when there are none, with the notice about people', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([])))

    const text = (await render()).textContent

    expect(text).toContain('Noch keine Fotos.')
    expect(text).toContain('Bitte keine Personen auf den Fotos.')
  })

  it('asks a guest to log in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([])))
    const onLoginNeeded = vi.fn()
    const container = await render({ onLoginNeeded })

    act(() => button(container, 'Foto hinzufügen')?.click())

    expect(onLoginNeeded).toHaveBeenCalled()
  })

  it('uploads the chosen file and says it waits for an Admin', async () => {
    saveToken('t')
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ id: 9, pending: true }, 201))
    vi.stubGlobal('fetch', fetchMock)
    const container = await render({ user })

    await choose(container, new File(['x'], 'platz.jpg', { type: 'image/jpeg' }))

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/places/7/photos')
    expect(init.method).toBe('POST')
    expect((init.body as FormData).get('file')).toBeInstanceOf(File)
    expect(container.textContent).toContain('sobald ein Admin es freigegeben hat')
    // The pending Photo is not shown.
    expect(container.querySelector('img')).toBeNull()
  })

  it('does not send a file that is too big or of the wrong type', async () => {
    saveToken('t')
    const fetchMock = vi.fn().mockResolvedValue(json([]))
    vi.stubGlobal('fetch', fetchMock)
    const container = await render({ user })

    await choose(container, new File(['x'], 'a.gif', { type: 'image/gif' }))
    expect(container.textContent).toContain('Nur JPEG, PNG oder WebP')

    const big = new File(['x'], 'b.jpg', { type: 'image/jpeg' })
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    await choose(container, big)
    expect(container.textContent).toContain('größer als 10 MB')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('shows the server answer when the limit is reached', async () => {
    saveToken('t')
    const conflict = json({ detail: 'Du hast hier schon 3 Fotos, die auf die Freigabe warten' }, 409)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json([])).mockResolvedValueOnce(conflict))
    const container = await render({ user })

    await choose(container, new File(['x'], 'c.png', { type: 'image/png' }))

    expect(container.textContent).toContain('schon 3 Fotos')
    expect(container.textContent).not.toContain('Danke!')
  })

  // SCRUM-159: some phones give no type or an unusual one; the server checks the bytes.
  it('sends a photo without a type or with an unusual image type', async () => {
    saveToken('t')
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? json({ id: 9, pending: true }, 201) : json([]),
    )
    vi.stubGlobal('fetch', fetchMock)
    const container = await render({ user })

    await choose(container, new File(['x'], 'IMG_0001', { type: '' }))
    await choose(container, new File(['x'], 'kamera.jpg', { type: 'image/jpg' }))

    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')
    expect(posts).toHaveLength(2)
    expect(container.textContent).not.toContain('Nur JPEG, PNG oder WebP')
  })

  it('still refuses a file that clearly is no photo, and offers the photo formats first', async () => {
    saveToken('t')
    const fetchMock = vi.fn().mockResolvedValue(json([]))
    vi.stubGlobal('fetch', fetchMock)
    const container = await render({ user })

    await choose(container, new File(['x'], 'plan.pdf', { type: 'application/pdf' }))

    expect(container.textContent).toContain('Nur JPEG, PNG oder WebP')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const accept = container.querySelector('input[type=file]')!.getAttribute('accept')!
    expect(accept.split(',')).toEqual(expect.arrayContaining(['image/jpeg', 'image/png', 'image/webp', '.jpg']))
  })

  // SCRUM-161: the signed links live 15 minutes; an open Place gets new ones before that.
  it('loads new signed links every 10 minutes and when the page comes back to the front', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const fresh = { ...photo, url: 'https://photos.example/places/7/a.jpg?signed=new' }
    const newest = { ...photo, url: 'https://photos.example/places/7/a.jpg?signed=newest' }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([photo]))
      .mockResolvedValueOnce(json([fresh]))
      .mockResolvedValueOnce(json([newest]))
    vi.stubGlobal('fetch', fetchMock)
    const container = await render()

    await act(async () => vi.advanceTimersByTime(9 * 60_000))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(60_000))
    expect(container.querySelector('img')!.getAttribute('src')).toBe(fresh.url)

    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(container.querySelector('img')!.getAttribute('src')).toBe(newest.url)
  })

  it('keeps the newest links when an older answer comes back later (SCRUM-161)', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    let sendFirst!: (response: Response) => void
    const first = new Promise<Response>((resolve) => (sendFirst = resolve))
    const fresh = { ...photo, url: 'https://photos.example/places/7/a.jpg?signed=new' }
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce(json([fresh])))
    const container = await render()

    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    await act(async () => sendFirst(json([photo])))

    expect(container.querySelector('img')!.getAttribute('src')).toBe(fresh.url)
  })

  it('keeps the photos and offers a retry when a refresh fails (SCRUM-161)', async () => {
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    const fresh = { ...photo, url: 'https://photos.example/places/7/a.jpg?signed=new' }
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json([photo]))
        .mockResolvedValueOnce(json({ detail: 'Netz weg' }, 503))
        .mockResolvedValueOnce(json([fresh])),
    )
    const container = await render()

    await act(async () => document.dispatchEvent(new Event('visibilitychange')))
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.textContent).toContain('Die Fotos konnten nicht neu geladen werden.')

    await act(async () => button(container, 'Erneut laden')!.click())
    expect(container.textContent).not.toContain('nicht neu geladen')
    expect(container.querySelector('img')!.getAttribute('src')).toBe(fresh.url)
  })

  // SCRUM-158: an Admin reviews a reported Place: the Photos show, no upload.
  it('shows the photos of a Place under review without an upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([photo])))

    const container = await render({ user, readOnly: true })

    expect(container.querySelector('img')).not.toBeNull()
    expect(button(container, 'Foto hinzufügen')).toBeUndefined()
    expect(container.querySelector('input[type=file]')).toBeNull()
  })
})
