// The service worker only shows Web Push messages (SCRUM-44); it caches nothing.

// A new version takes over at once instead of waiting until every tab is closed, and it
// controls the open tabs, so a tap on a message can navigate them (SCRUM-109).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let message = { title: 'SquadMeet', body: 'Du hast eine neue Benachrichtigung.', url: '/', tag: 'squadmeet' }
  try {
    message = { ...message, ...event.data.json() }
  } catch {
    // Keep the safe fallback when a provider delivers an empty or malformed payload.
  }
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      // PNG: Android does not show SVG icons in notifications.
      icon: '/icon-192.png',
      tag: message.tag,
      data: { url: message.url },
    }),
  )
})

// Only a page of this app: a URL of another site in a message opens the start page.
function targetOf(url) {
  const target = new URL(url || '/', self.location.origin)
  return target.origin === self.location.origin ? target.href : new URL('/', self.location.origin).href
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = targetOf(event.notification.data?.url)
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windows) => {
      for (const client of windows) {
        try {
          // navigate() works only for a tab this worker controls; otherwise focus is enough.
          const moved = 'navigate' in client ? await client.navigate(target) : null
          return (moved ?? client).focus()
        } catch {
          return client.focus()
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
