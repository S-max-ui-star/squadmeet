import { useCallback, useEffect, useState } from 'react'
import Dialog from '../Dialog'
import { onTopicChange } from '../api/live'
import { joinMeetup } from '../api/meetups'
import {
  deleteAllNotifications,
  deleteNotification,
  deleteReadNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type Notification,
} from '../api/notifications'

type Props = {
  token: string
  onChanged: (notifications: Notification[]) => void
  onOpenMeetup: (placeId: number) => void
  onClose: () => void
}

const when = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

type ActionsProps = {
  notices: Notification[]
  busy: boolean
  onReadAll: () => void
  onRemoveRead: () => void
  onRemoveAll: () => void
}

// Each button is off when it has nothing to do (SCRUM-101).
function NotificationActions({ notices, busy, onReadAll, onRemoveRead, onRemoveAll }: ActionsProps) {
  const anyUnread = notices.some((notice) => !notice.read)
  const anyRead = notices.some((notice) => notice.read)
  return (
    <div className="notification-actions">
      <button type="button" className="notification-read-all" disabled={busy || !anyUnread} onClick={onReadAll}>
        Alle gelesen
      </button>
      <button type="button" className="notification-delete-read" disabled={busy || !anyRead} onClick={onRemoveRead}>
        Gelesene löschen
      </button>
      <button type="button" className="danger notification-delete-all" disabled={busy} onClick={onRemoveAll}>
        Alle löschen
      </button>
    </div>
  )
}

export default function NotificationsDialog({ token, onChanged, onOpenMeetup, onClose }: Props) {
  const [data, setData] = useState<Notification[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Invitations accepted in this dialog (SCRUM-43).
  const [accepted, setAccepted] = useState<Set<number>>(new Set())

  const reload = useCallback(
    () =>
      fetchNotifications(token)
        .then((found) => {
          setData(found)
          onChanged(found)
          setError(null)
        })
        .catch((err: Error) => setError(err.message)),
    [token, onChanged],
  )

  // Loads now and again on each live event while open (SCRUM-93).
  useEffect(() => {
    void reload()
    return onTopicChange('notifications', () => void reload())
  }, [reload])

  async function open(notice: Notification) {
    if (busy || data === null) return
    setBusy(true)
    setError(null)
    try {
      await markNotificationRead(token, notice.id)
      const updated = data.map((item) => (item.id === notice.id ? { ...item, read: true } : item))
      setData(updated)
      onChanged(updated)
      onOpenMeetup(notice.place_id)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  // Runs one request, then shows the changed list and passes it on for the unread count.
  async function change(request: () => Promise<void>, next: (items: Notification[]) => Notification[]) {
    if (busy || data === null) return
    setBusy(true)
    setError(null)
    try {
      await request()
      const updated = next(data)
      setData(updated)
      onChanged(updated)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = (notice: Notification) =>
    change(
      () => deleteNotification(token, notice.id),
      (items) => items.filter((item) => item.id !== notice.id),
    )

  function removeAll() {
    if (busy || data === null || !window.confirm('Alle Benachrichtigungen löschen?')) return
    return change(() => deleteAllNotifications(token), () => [])
  }

  // SCRUM-101: "Alle gelesen" and "Gelesene löschen".
  const readAll = () =>
    change(
      () => markAllNotificationsRead(token),
      (items) => items.map((item) => ({ ...item, read: true })),
    )

  const removeRead = () =>
    change(
      () => deleteReadNotifications(token),
      (items) => items.filter((item) => !item.read),
    )

  // "Ich komme mit" right from an invitation, with Party size 1; then the Meetup opens.
  async function accept(notice: Notification) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await joinMeetup(token, notice.meetup_id, 1)
      setAccepted((current) => new Set(current).add(notice.id))
    } catch (err) {
      setError((err as Error).message)
      return
    } finally {
      setBusy(false)
    }
    await open(notice)
  }

  return (
    <Dialog title="Benachrichtigungen" className="notifications" onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      {data === null && !error && <p>Lädt …</p>}
      {data?.length === 0 && <p className="hint">Noch keine Benachrichtigungen.</p>}
      {data && data.length > 0 && (
        <>
          <NotificationActions
            notices={data}
            busy={busy}
            onReadAll={readAll}
            onRemoveRead={removeRead}
            onRemoveAll={removeAll}
          />
          <ul className="notification-list">
            {data.map((notice) => (
              <li key={notice.id}>
                <button
                  type="button"
                  className={`notification-open${notice.read ? '' : ' unread'}`}
                  disabled={busy}
                  onClick={() => open(notice)}
                >
                  <strong>{notice.text}</strong>
                  <time dateTime={notice.created_at}>{when.format(new Date(notice.created_at))} Uhr</time>
                </button>
                <button
                  type="button"
                  className="notification-delete"
                  aria-label="Löschen"
                  disabled={busy}
                  onClick={() => remove(notice)}
                >
                  ×
                </button>
                {notice.kind === 'meetup_invitation' && !accepted.has(notice.id) && (
                  <button type="button" className="notification-accept" disabled={busy} onClick={() => accept(notice)}>
                    Ich komme mit
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <button type="button" className="link" onClick={onClose}>
        Schließen
      </button>
    </Dialog>
  )
}
