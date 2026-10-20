import { useCallback, useEffect, useState } from 'react'
import Dialog from '../Dialog'
import { onTopicChange } from '../api/live'
import { joinMeetup } from '../api/meetups'
import {
  fetchNotifications,
  markNotificationRead,
  type Notification,
  type NotificationKind,
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

// `actor`: the Contact for the SCRUM-43 kinds; null after that account was deleted.
const messages: Record<NotificationKind, (place: string, actor: string | null) => string> = {
  meetup_cancelled: (place) => `Das Treffen bei „${place}“ wurde abgesagt.`,
  meetup_ended: (place) => `Das Treffen bei „${place}“ wurde wegen einer Platzsperrung beendet.`,
  host_handover: (place) => `Du bist jetzt Gastgeber des Treffens bei „${place}“.`,
  blocked_user_joined: (place) =>
    `Jemand, den du blockiert hast, ist dem Treffen bei „${place}“ beigetreten.`,
  favorite_meetup_created: (place) => `Bei deinem Favoriten „${place}“ wurde ein neues Treffen erstellt.`,
  contact_meetup_created: (place, actor) => `${actor ?? 'Ein Kontakt'} plant ein Treffen bei „${place}“.`,
  meetup_invitation: (place, actor) => `${actor ?? 'Ein Kontakt'} lädt dich zum Treffen bei „${place}“ ein.`,
  home_area_meetup_created: (place) => `In deinem Heimatbereich gibt es ein neues Treffen bei „${place}“.`,
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
        <ul className="notification-list">
          {data.map((notice) => (
            <li key={notice.id}>
              <button
                type="button"
                className={notice.read ? '' : 'unread'}
                disabled={busy}
                onClick={() => open(notice)}
              >
                <strong>{messages[notice.kind](notice.place_name, notice.actor_nickname ?? null)}</strong>
                {notice.place_address && <span>{notice.place_address}</span>}
                <time dateTime={notice.created_at}>{when.format(new Date(notice.created_at))} Uhr</time>
              </button>
              {notice.kind === 'meetup_invitation' && !accepted.has(notice.id) && (
                <button type="button" className="notification-accept" disabled={busy} onClick={() => accept(notice)}>
                  Ich komme mit
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="link" onClick={onClose}>
        Schließen
      </button>
    </Dialog>
  )
}
