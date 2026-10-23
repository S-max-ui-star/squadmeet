import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveToken } from '../api/auth'
import PlaceDetail from './PlaceDetail'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const here = { coords: { latitude: 51.3001, longitude: 12.3001, accuracy: 6 } }
const user = { id: 1, nickname: 'Stefan', avatar: 'fox', is_admin: false, mfa_enabled: false }
const roots = new Set<ReturnType<typeof createRoot>>()

afterEach(() => {
  for (const root of roots) act(() => root.unmount())
  roots.clear()
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
})

function render(props: Parameters<typeof PlaceDetail>[0]) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.add(root)
  act(() => root.render(<PlaceDetail {...props} />))
  return { container, root }
}

const place = {
  id: 7,
  name: 'Korbanlage',
  activity_type: 'basketball',
  lat: 51.3,
  lon: 12.3,
  address: 'Anton-Bruckner-Allee 1, Leipzig',
  people_now: 0,
  is_suggestion: false,
  confirmations: 0,
}

describe('PlaceDetail', () => {
  it('shows name, Activity type and the stored address', () => {
    const { container } = render({ place, error: null, onRetry: () => {}, onClose: () => {} })
    const text = container.textContent

    expect(text).toContain('Korbanlage')
    expect(text).toContain('Basketball')
    expect(text).toContain('Adresse')
    expect(text).toContain('Anton-Bruckner-Allee 1, Leipzig')
    expect(text).not.toContain('Von Nutzern hinzugefügt')
    const route = container.querySelector<HTMLAnchorElement>('a[href*="maps/dir"]')
    expect(route?.href).toContain('destination=51.3,12.3')
    expect(route?.target).toBe('_blank')
    expect([...container.querySelectorAll('button')].some((button) => button.textContent === 'Teilen')).toBe(true)
  })

  it('marks a Place that came from a suggestion with "Von Nutzern hinzugefügt"', () => {
    const userAdded = { ...place, is_suggestion: false, confirmations: 3 }
    const text = render({ place: userAdded, error: null, onRetry: () => {}, onClose: () => {} }).container.textContent

    expect(text).toContain('Von Nutzern hinzugefügt')
  })

  it('marks a Place suggestion and hides Meetups and Ratings', () => {
    const suggestion = { ...place, is_suggestion: true, confirmations: 1 }
    const { container } = render({
      place: suggestion,
      error: null,
      onRetry: () => {},
      onClose: () => {},
      children: (
        <>
          <p>Treffen hier</p>
          <p>Bewertungen hier</p>
        </>
      ),
    })

    expect(container.textContent).toContain('1 von 3 Bestätigungen')
    expect(container.textContent).not.toContain('Treffen hier')
    expect(container.textContent).not.toContain('Bewertungen hier')
  })

  it('shows a suggestion with 3 Confirmations as waiting for an Admin, without the confirm button', () => {
    const waiting = { ...place, is_suggestion: true, confirmations: 3, waiting_for_admin: true }
    const { container } = render({
      place: waiting,
      error: null,
      onRetry: () => {},
      onClose: () => {},
      children: <p>Treffen hier</p>,
    })

    expect(container.textContent).toContain('wartet auf Freigabe')
    expect(container.textContent).toContain('3 von 3 Bestätigungen')
    expect(container.textContent).not.toContain('Vor Ort bestätigen')
    expect(container.textContent).not.toContain('Treffen hier')
    expect(container.textContent).not.toContain('Von Nutzern hinzugefügt')
  })

  it('confirms a Place suggestion at the Place with the browser location', async () => {
    saveToken('tok')
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (ok: (p: typeof here) => void) => ok(here) },
    })
    const confirmed = { ...place, is_suggestion: false, confirmations: 3 }
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json(confirmed))
    vi.stubGlobal('fetch', fetchMock)
    const onConfirmed = vi.fn()
    const suggestion = { ...place, is_suggestion: true, confirmations: 2 }
    const { container } = render({
      place: suggestion,
      error: null,
      onRetry: () => {},
      onClose: () => {},
      user,
      onConfirmed,
    })
    const confirmBtn = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Vor Ort bestätigen'),
    )!

    await act(async () => confirmBtn.click())

    expect(fetchMock.mock.calls[0][0]).toBe('/api/place-suggestions/7/confirm')
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ lat: 51.3001, lon: 12.3001 })
    expect(onConfirmed).toHaveBeenCalledWith(confirmed)
  })

  it('asks for a login when a guest taps confirm, and shows a server error when too far away', async () => {
    const onLoginNeeded = vi.fn()
    const suggestion = { ...place, is_suggestion: true, confirmations: 1 }
    const { container: guestContainer } = render({
      place: suggestion,
      error: null,
      onRetry: () => {},
      onClose: () => {},
      onLoginNeeded,
    })
    const guestBtn = [...guestContainer.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Vor Ort bestätigen'),
    )!
    act(() => guestBtn.click())
    expect(onLoginNeeded).toHaveBeenCalledOnce()

    saveToken('tok')
    vi.stubGlobal('navigator', {
      geolocation: { getCurrentPosition: (ok: (p: typeof here) => void) => ok(here) },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValueOnce(
        Response.json(
          { detail: 'Du musst am Platz sein (höchstens 100 m entfernt), um ihn zu bestätigen.' },
          { status: 400 },
        ),
      ),
    )
    const { container: loggedInContainer } = render({
      place: suggestion,
      error: null,
      onRetry: () => {},
      onClose: () => {},
      user,
    })
    const btn = [...loggedInContainer.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Vor Ort bestätigen'),
    )!
    await act(async () => btn.click())

    expect(loggedInContainer.textContent).toContain('höchstens 100 m entfernt')
  })

  it('closes with the "×" button at the top, also while loading and after an error', () => {
    for (const props of [
      { place, error: null },
      { place: null, error: null },
      { place: null, error: 'GET failed: 500' },
    ]) {
      const onClose = vi.fn()
      const { container, root } = render({ ...props, onRetry: () => {}, onClose })
      const close = container.querySelector<HTMLButtonElement>('.place-detail-head button[aria-label="Schließen"]')!

      act(() => close.click())

      expect(onClose).toHaveBeenCalledOnce()
      act(() => root.unmount())
      roots.delete(root)
      container.remove()
    }
  })

  it('has no "Zurück zur Karte" link: the × closes the detail (SCRUM-174)', () => {
    const { container } = render({ place, error: null, onRetry: () => {}, onClose: () => {} })

    expect(container.querySelector('.place-detail-back')).toBeNull()
    expect(container.textContent).not.toContain('Zurück')
  })

  it('offers to try again after an error', () => {
    const onRetry = vi.fn()
    const { container } = render({ place: null, error: 'GET failed: 500', onRetry, onClose: () => {} })
    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Nochmal versuchen')!

    act(() => retry.click())

    expect(onRetry).toHaveBeenCalledOnce()
  })

  describe('sheet on a phone (SCRUM-167)', () => {
    const sheetOf = (container: HTMLElement) => container.querySelector<HTMLElement>('.place-detail')!
    const gripOf = (container: HTMLElement) => container.querySelector<HTMLButtonElement>('.place-detail-grip')!
    const key = (grip: HTMLElement, name: string) =>
      act(() => grip.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true })))

    it('starts half open with a grip in the head that names the height', () => {
      const { container } = render({ place, error: null, onRetry: () => {}, onClose: () => {} })

      expect(sheetOf(container).dataset.snap).toBe('half')
      expect(container.querySelector('.place-detail-head .place-detail-grip')).not.toBeNull()
      expect(gripOf(container).getAttribute('aria-label')).toBe('Fenstergröße halb, ändern auf ganz')
    })

    it('goes half → full → small → half with taps on the grip', () => {
      const { container } = render({ place, error: null, onRetry: () => {}, onClose: () => {} })
      const seen = []
      for (let i = 0; i < 3; i++) {
        act(() => gripOf(container).click())
        seen.push(sheetOf(container).dataset.snap)
      }

      expect(seen).toEqual(['full', 'small', 'half'])
    })

    it('changes the height with the arrow keys, without a drag', () => {
      const { container } = render({ place, error: null, onRetry: () => {}, onClose: () => {} })

      key(gripOf(container), 'ArrowDown')
      expect(sheetOf(container).dataset.snap).toBe('small')
      key(gripOf(container), 'ArrowUp')
      key(gripOf(container), 'ArrowUp')
      expect(sheetOf(container).dataset.snap).toBe('full')
      expect(gripOf(container).getAttribute('aria-label')).toBe('Fenstergröße ganz, ändern auf klein')
    })

    it('snaps to the closest height when the finger lets go, and the drag is no tap', () => {
      const { container } = render({ place, error: null, onRetry: () => {}, onClose: () => {} })
      const sheet = sheetOf(container)
      const grip = gripOf(container)
      // jsdom has no layout: the sheet reports the height it was given while dragging.
      let height = 0.6 * window.innerHeight
      sheet.getBoundingClientRect = () => ({ height }) as DOMRect
      const pointer = (type: string, clientY: number) =>
        act(() => grip.dispatchEvent(new MouseEvent(type, { clientY, bubbles: true })))

      pointer('pointerdown', 500)
      pointer('pointermove', 200)
      height = parseFloat(sheet.style.height)
      pointer('pointerup', 200)
      act(() => grip.click())

      expect(sheet.dataset.snap).toBe('full')
      expect(sheet.style.height).toBe('')
    })

    it('still closes with × and Escape in every height', () => {
      const onClose = vi.fn()
      const { container } = render({ place, error: null, onRetry: () => {}, onClose })

      act(() => gripOf(container).click())
      act(() => container.querySelector<HTMLButtonElement>('.place-detail-close')!.click())
      act(() => gripOf(container).click())
      act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))

      expect(onClose).toHaveBeenCalledTimes(2)
    })
  })

  it('moves focus to close, closes with Escape and restores the opener', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const onClose = vi.fn()
    const { container, root } = render({ place, error: null, onRetry: () => {}, onClose })
    const close = container.querySelector<HTMLButtonElement>('.place-detail-close')!

    expect(document.activeElement).toBe(close)
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
    expect(onClose).toHaveBeenCalledOnce()

    act(() => root.unmount())
    roots.delete(root)
    expect(document.activeElement).toBe(opener)
  })
})

