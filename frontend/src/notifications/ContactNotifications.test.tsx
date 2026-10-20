// SCRUM-43: Contact Notifications and invitations in the Notification list.
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Notification } from '../api/notifications'
import NotificationsDialog from './NotificationsDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const base = {
  meetup_id: 12,
  place_id: 4,
  place_name: 'Korbanlage',
  place_address: null,
  created_at: '2026-10-16T08:00:00Z',
  read: false,
}

const invitation: Notification = {
  ...base,
  id: 2,
  kind: 'meetup_invitation',
  actor_nickname: 'Pingpong_Paula',
  text: 'Pingpong_Paula hat dich eingeladen: Basketball',
}
const created: Notification = {
  ...base,
  id: 1,
  kind: 'contact_meetup_created',
  actor_nickname: 'Pingpong_Paula',
  text: 'Pingpong_Paula hat ein Treffen erstellt: Basketball',
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status })
}

async function render(onOpenMeetup = vi.fn()) {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () =>
    createRoot(container).render(
      <NotificationsDialog token="t" onChanged={() => {}} onOpenMeetup={onOpenMeetup} onClose={() => {}} />,
    ),
  )
  return container
}

function button(container: HTMLElement, text: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent === text)
}

describe('Contact Notifications', () => {
  it('names the Contact', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([invitation, created])))

    const text = (await render()).textContent

    expect(text).toContain(invitation.text)
    expect(text).toContain(created.text)
  })

  it('says "Ein Kontakt" after the account was deleted', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(json([{ ...created, actor_nickname: null, text: 'Jemand hat ein Treffen erstellt: Basketball' }])),
    )

    expect((await render()).textContent).toContain('Jemand hat ein Treffen erstellt: Basketball')
  })

  it('offers "Ich komme mit" only on an invitation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json([invitation, created])))

    const container = await render()

    expect(container.querySelectorAll('.notification-accept')).toHaveLength(1)
  })

  it('"Ich komme mit" joins with Party size 1 and opens the Meetup', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json([invitation]))
      .mockResolvedValueOnce(json({ id: 12 }, 201))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)
    const onOpenMeetup = vi.fn()
    const container = await render(onOpenMeetup)

    await act(async () => button(container, 'Ich komme mit')?.click())

    const [url, init] = fetchMock.mock.calls[1]
    expect(url).toBe('/api/meetups/12/join')
    expect(JSON.parse(init.body)).toEqual({ party_size: 1 })
    expect(fetchMock.mock.calls[2][0]).toBe('/api/notifications/2/read')
    expect(onOpenMeetup).toHaveBeenCalledWith(4)
    expect(button(container, 'Ich komme mit')).toBeUndefined()
  })

  it('shows the server answer when joining fails', async () => {
    const conflict = json({ detail: 'Das Treffen ist abgesagt' }, 409)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json([invitation])).mockResolvedValueOnce(conflict))
    const onOpenMeetup = vi.fn()
    const container = await render(onOpenMeetup)

    await act(async () => button(container, 'Ich komme mit')?.click())

    expect(container.textContent).toContain('Das Treffen ist abgesagt')
    expect(onOpenMeetup).not.toHaveBeenCalled()
  })
})
