import { removePushSubscription } from '../api/push'

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const raw = atob(padded)
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export function needsIosHomeScreen(userAgent: string, standalone: boolean): boolean {
  return /iPhone|iPad|iPod/i.test(userAgent) && !standalone
}

export function runsStandalone(): boolean {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean }
  return navigatorWithStandalone.standalone === true
    || (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
}

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** At logout (SCRUM-146): the server forgets this browser's subscription and the browser ends it,
 * so a shared device gets no more Push messages of the account that just logged out. Errors do
 * not stop the logout. getRegistration, not .ready: .ready never ends without a service worker. */
export async function dropPushSubscription(token: string): Promise<void> {
  if (!pushSupported()) return
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined)
  const subscription = await registration?.pushManager.getSubscription().catch(() => null)
  if (!subscription) return
  await removePushSubscription(token, subscription.endpoint).catch(() => {})
  await subscription.unsubscribe().catch(() => false)
}
