// In-app Notifications about Meetup events (SCRUM-40).

import { answer } from './http'

export type NotificationKind =
  | 'meetup_cancelled'
  | 'meetup_ended'
  | 'host_handover'
  | 'blocked_user_joined'
  | 'favorite_meetup_created'
  // SCRUM-43: a Contact made a Meetup; a Contact invited the user.
  | 'contact_meetup_created'
  | 'meetup_invitation'
  // SCRUM-45: a new Meetup inside the user's Home area.
  | 'home_area_meetup_created'

export type Notification = {
  id: number
  kind: NotificationKind
  meetup_id: number
  place_id: number
  place_name: string
  place_address: string | null
  created_at: string
  read: boolean
  // The Contact for the SCRUM-43 kinds; null for the others and after that account was deleted.
  actor_nickname?: string | null
}

export async function fetchNotifications(token: string): Promise<Notification[]> {
  return answer(
    await fetch('/api/notifications', { headers: { Authorization: `Bearer ${token}` } }),
    'GET notifications',
  )
}

export async function markNotificationRead(token: string, notificationId: number): Promise<void> {
  const response = await fetch(`/api/notifications/${notificationId}/read`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) await answer(response, 'POST notification read')
}

export async function deleteNotification(token: string, notificationId: number): Promise<void> {
  const response = await fetch(`/api/notifications/${notificationId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) await answer(response, 'DELETE notification')
}

export async function deleteAllNotifications(token: string): Promise<void> {
  const response = await fetch('/api/notifications', {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) await answer(response, 'DELETE notifications')
}
