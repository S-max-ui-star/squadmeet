// Photos (SCRUM-42): the API of backend/app/photos.py. Only approved Photos come back in the
// list; a new one waits for an Admin. The `url` is a short-lived signed link (15 min).
import { answer } from './http'

export type Photo = {
  id: number
  url: string
  width: number
  height: number
  created_at: string
}

export type PendingPhoto = Photo & {
  place_id: number
  place_name: string
  activity_type: string
  // null after the uploader deleted the account.
  nickname: string | null
}

// The server checks the same; the browser checks first, so a big file is not sent for nothing.
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']

function auth(token: string | null | undefined): HeadersInit {
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// The switch PHOTOS_ENABLED (SCRUM-94): Photos are deferred. Without a clear "on", they stay hidden.
export async function fetchPhotosEnabled(): Promise<boolean> {
  try {
    const config = await answer<{ enabled: boolean }>(await fetch('/api/photos/config'), 'GET photos config')
    return config.enabled === true
  } catch {
    return false
  }
}

export async function fetchPhotos(placeId: number, token?: string | null): Promise<Photo[]> {
  return answer(await fetch(`/api/places/${placeId}/photos`, { headers: auth(token) }), 'GET photos')
}

export async function uploadPhoto(token: string, placeId: number, file: File): Promise<void> {
  const body = new FormData()
  body.append('file', file)
  // No Content-Type: the browser sets multipart/form-data with its boundary.
  const response = await fetch(`/api/places/${placeId}/photos`, { method: 'POST', headers: auth(token), body })
  await answer(response, 'POST photo')
}

export async function fetchPendingPhotos(token: string): Promise<PendingPhoto[]> {
  return answer(await fetch('/api/admin/photos', { headers: auth(token) }), 'GET pending photos')
}

async function decide(token: string, photoId: number, action: 'approve' | 'reject'): Promise<void> {
  const response = await fetch(`/api/admin/photos/${photoId}/${action}`, { method: 'POST', headers: auth(token) })
  // 204 has no body, so `answer` (which reads JSON) is only used on errors.
  if (!response.ok) await answer(response, `POST ${action} photo`)
}

export const approvePhoto = (token: string, photoId: number) => decide(token, photoId, 'approve')
export const rejectPhoto = (token: string, photoId: number) => decide(token, photoId, 'reject')
