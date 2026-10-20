import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Contacts } from '../api/contacts'
import { announceTopicChange } from '../api/live'
import ContactsDialog from './ContactsDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Unmount, so a dialog from an earlier test does not answer live events.
let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

const karl = { id: 2, nickname: 'Korb_Karl', avatar: 'bear' }
const mia = { id: 3, nickname: 'Mia_Matte', avatar: 'fox' }
const data: Contacts = {
  contacts: [mia],
  incoming: [{ id: 11, user: karl, status: 'pending' }],
  outgoing: [{ id: 12, user: { id: 4, nickname: 'Nina', avatar: 'cat' }, status: 'declined' }],
  blocked: [],
}

async function render(fetchMock: ReturnType<typeof vi.fn>, onChanged = vi.fn()) {
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(<ContactsDialog token="t" onChanged={onChanged} onClose={() => {}} />),
  )
  return container
}

const button = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)

describe('ContactsDialog (SCRUM-32)', () => {
  it('shows Contacts, requests to the user and a declined request', async () => {
    const onChanged = vi.fn()
    const container = await render(vi.fn(async () => Response.json(data)), onChanged)

    const text = container.textContent
    expect(text).toContain('Anfragen an dich')
    expect(text).toContain('Korb_Karl')
    expect(text).toContain('Mia_Matte')
    expect(text).toContain('abgelehnt')
    expect(button(container, 'Neu anfragen')).toBeDefined()
    expect(onChanged).toHaveBeenCalledWith(data)
  })

  it('accepts a request', async () => {
    const fetchMock = vi.fn(async () => Response.json(data))
    const container = await render(fetchMock)

    await act(async () => button(container, 'Annehmen')!.click())

    const calls = fetchMock.mock.calls as unknown as [string, RequestInit][]
    expect(calls.some(([url, init]) => url === '/api/contacts/requests/11/accept' && init.method === 'POST')).toBe(true)
  })

  it('asks by Nickname and shows the server message when it is not possible', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
      init?.method === 'POST' ? Response.json({ detail: 'Anfrage nicht möglich' }, { status: 409 }) : Response.json(data),
    )
    const container = await render(fetchMock)
    const input = container.querySelector('input')!

    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setValue.call(input, 'Pingpong_Paula')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => button(container, 'Anfragen')!.click())

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(JSON.parse(post[1]!.body as string)).toEqual({ nickname: 'Pingpong_Paula' })
    expect(container.textContent).toContain('Anfrage nicht möglich')
  })

  it('blocks a Contact and lists blocked users with "Aufheben"', async () => {
    const blockedData = { ...data, contacts: [], blocked: [mia] }
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(data))
      .mockResolvedValueOnce(Response.json(mia, { status: 201 }))
      .mockResolvedValue(Response.json(blockedData))
    const container = await render(fetchMock)

    await act(async () => button(container, 'Blockieren')!.click())

    expect(fetchMock.mock.calls[1][0]).toBe('/api/blocks')
    expect(container.textContent).toContain('Blockiert')
    expect(button(container, 'Aufheben')).toBeDefined()
  })

  it('loads again on a live Contacts event while it is open (SCRUM-93)', async () => {
    const fetchMock = vi.fn(async () => Response.json(data))
    await render(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => announceTopicChange('notifications'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => announceTopicChange('contacts'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
