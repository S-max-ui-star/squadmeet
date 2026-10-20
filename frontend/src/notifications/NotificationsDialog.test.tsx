import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { announceTopicChange } from '../api/live'
import type { Notification } from '../api/notifications'
import NotificationsDialog from './NotificationsDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const notices: Notification[] = [
  {
    id: 2,
    kind: 'host_handover',
    meetup_id: 12,
    place_id: 4,
    place_name: 'Clara-Zetkin-Park',
    place_address: 'Anton-Bruckner-Allee, 04107 Leipzig',
    text: 'Pingpong_Paula hat dir die Gastgeberrolle übergeben: Tischtennis in der Anton-Bruckner-Allee',
    created_at: '2026-10-15T08:00:00Z',
    read: false,
  },
  {
    id: 1,
    kind: 'meetup_cancelled',
    meetup_id: 11,
    place_id: 3,
    place_name: 'Friedenspark',
    place_address: 'Linnéstraße, 04103 Leipzig',
    text: 'Pingpong_Paula hat das Treffen abgesagt: Tischtennis in der Linnéstraße',
    created_at: '2026-10-15T07:00:00Z',
    read: true,
  },
]

// Unmount, so a dialog from an earlier test does not answer live events.
let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  root = undefined
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

async function render(fetchMock: ReturnType<typeof vi.fn>, onChanged = vi.fn(), onOpenMeetup = vi.fn()) {
  vi.stubGlobal('fetch', fetchMock)
  const container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
  await act(async () =>
    root!.render(
      <NotificationsDialog token="tok" onChanged={onChanged} onOpenMeetup={onOpenMeetup} onClose={() => {}} />,
    ),
  )
  return { container, onChanged, onOpenMeetup }
}

describe('NotificationsDialog (SCRUM-40)', () => {
  it('shows the newest Notifications and their read state', async () => {
    const { container } = await render(vi.fn(async () => Response.json(notices)))
    const items = [...container.querySelectorAll('.notification-open')]

    expect(items.map((item) => item.textContent)).toEqual([
      expect.stringContaining(notices[0].text),
      expect.stringContaining(notices[1].text),
    ])
    expect(items[0].textContent).not.toContain('04107')
    expect(items[0].classList.contains('unread')).toBe(true)
    expect(items[1].classList.contains('unread')).toBe(false)
  })

  it('marks a Notification as read and opens its Meetup', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(notices))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { container, onChanged, onOpenMeetup } = await render(fetchMock)

    await act(async () => (container.querySelector('.notification-open') as HTMLButtonElement).click())

    expect(fetchMock.mock.calls[1][0]).toBe('/api/notifications/2/read')
    expect(onChanged).toHaveBeenLastCalledWith([{ ...notices[0], read: true }, notices[1]])
    expect(onOpenMeetup).toHaveBeenCalledWith(4)
  })

  it('deletes one Notification and updates the unread count source', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(notices))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const { container, onChanged } = await render(fetchMock)

    await act(async () => (container.querySelector('button[aria-label="Löschen"]') as HTMLButtonElement).click())

    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/notifications/2',
      { method: 'DELETE', headers: { Authorization: 'Bearer tok' } },
    ])
    expect(onChanged).toHaveBeenLastCalledWith([notices[1]])
    expect(container.querySelectorAll('.notification-open')).toHaveLength(1)
  })

  it('deletes all Notifications only after confirmation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(Response.json(notices))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    const { container, onChanged } = await render(fetchMock)
    const deleteAll = container.querySelector('.notification-delete-all') as HTMLButtonElement

    await act(async () => deleteAll.click())
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => deleteAll.click())

    expect(confirm).toHaveBeenCalledWith('Alle Benachrichtigungen löschen?')
    expect(fetchMock.mock.calls[1]).toEqual([
      '/api/notifications',
      { method: 'DELETE', headers: { Authorization: 'Bearer tok' } },
    ])
    expect(onChanged).toHaveBeenLastCalledWith([])
    expect(container.textContent).toContain('Noch keine Benachrichtigungen')
  })

  it('shows an empty state', async () => {
    const { container } = await render(vi.fn(async () => Response.json([])))
    expect(container.textContent).toContain('Noch keine Benachrichtigungen')
  })

  it('loads again on a live Notifications event while it is open (SCRUM-93)', async () => {
    const fetchMock = vi.fn(async () => Response.json(notices))
    const { onChanged } = await render(fetchMock)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await act(async () => announceTopicChange('contacts'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(async () => announceTopicChange('notifications'))

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(onChanged).toHaveBeenCalledTimes(2)
  })
})
