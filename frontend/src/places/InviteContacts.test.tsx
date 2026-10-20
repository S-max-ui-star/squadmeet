import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { saveToken } from '../api/auth'
import InviteContacts from './InviteContacts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const contacts = {
  contacts: [
    { id: 2, nickname: 'Korb_Karl', avatar: 'fox' },
    { id: 3, nickname: 'Mia_Matte', avatar: 'owl' },
  ],
  incoming: [],
  outgoing: [],
  blocked: [],
}

afterEach(() => {
  document.body.innerHTML = ''
  localStorage.clear()
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

// Answers by URL: the Contacts, who is already in or invited, and the POST of the invitations.
function server({ list = contacts, done = [] as number[], invited = 0 } = {}) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    if (url === '/api/contacts') return json(list)
    if (init?.method === 'POST') return json({ invited })
    return json({ user_ids: done })
  })
}

async function render() {
  saveToken('t')
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => createRoot(container).render(<InviteContacts meetup={{ id: 12, actions: ['leave', 'invite'] }} />))
  await act(async () => button(container, 'Kontakte einladen')?.click())
  return container
}

function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

describe('InviteContacts', () => {
  it('shows nothing without the action "invite"', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    await act(async () => createRoot(container).render(<InviteContacts meetup={{ id: 12, actions: ['join'] }} />))

    expect(container.textContent).toBe('')
  })

  it('lists the Contacts; "Einladen" waits for a choice', async () => {
    vi.stubGlobal('fetch', server())

    const container = await render()

    expect(container.textContent).toContain('Korb_Karl')
    expect(container.textContent).toContain('Mia_Matte')
    expect(button(container, 'Einladen')?.disabled).toBe(true)
  })

  it('invites the chosen Contacts', async () => {
    const fetchMock = server({ invited: 2 })
    vi.stubGlobal('fetch', fetchMock)
    const container = await render()

    const boxes = container.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    act(() => boxes[0].click())
    act(() => boxes[1].click())
    await act(async () => button(container, 'Einladen')?.click())

    const [url, init] = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST')!
    expect(url).toBe('/api/meetups/12/invite')
    expect(JSON.parse(init!.body as string)).toEqual({ user_ids: [2, 3] })
    expect(container.textContent).toContain('2 Kontakte eingeladen.')
  })

  it('says so when everyone is already in or invited', async () => {
    vi.stubGlobal('fetch', server({ invited: 0 }))
    const container = await render()

    act(() => container.querySelector<HTMLInputElement>('input[type=checkbox]')!.click())
    await act(async () => button(container, 'Einladen')?.click())

    expect(container.textContent).toContain('schon dabei oder eingeladen')
  })

  it('says when there are no Contacts', async () => {
    vi.stubGlobal('fetch', server({ list: { ...contacts, contacts: [] } }))

    const container = await render()

    expect(container.textContent).toContain('Du hast noch keine Kontakte.')
    expect(button(container, 'Einladen')).toBeUndefined()
  })
  it('ticks a Contact who is already in or invited; they cannot be picked (SCRUM-84)', async () => {
    const fetchMock = server({ done: [2] })
    vi.stubGlobal('fetch', fetchMock)

    const container = await render()

    expect(fetchMock.mock.calls.map(([url]) => url)).toContain('/api/meetups/12/invite')
    const karl = [...container.querySelectorAll('li')].find((li) => li.textContent?.includes('Korb_Karl'))!
    expect(karl.textContent).toContain('✓')
    expect(karl.querySelector('input')).toBeNull()
    const mia = [...container.querySelectorAll('li')].find((li) => li.textContent?.includes('Mia_Matte'))!
    expect(mia.textContent).not.toContain('✓')
    expect(mia.querySelector('input')).not.toBeNull()
  })

  it('ticks the Contacts just invited', async () => {
    let done: number[] = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/contacts') return json(contacts)
      if (init?.method === 'POST') {
        done = [3]
        return json({ invited: 1 })
      }
      return json({ user_ids: done })
    })
    vi.stubGlobal('fetch', fetchMock)
    const container = await render()

    const mia = () => [...container.querySelectorAll('li')].find((li) => li.textContent?.includes('Mia_Matte'))!
    act(() => mia().querySelector('input')!.click())
    await act(async () => button(container, 'Einladen')?.click())

    expect(mia().textContent).toContain('✓')
    expect(mia().querySelector('input')).toBeNull()
  })
})
