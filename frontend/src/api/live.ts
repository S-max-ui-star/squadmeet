// Live updates (SCRUM-93): one open stream to GET /api/live per signed-in page. The server sends
// a topic when the user's Notifications or Contacts change, "meetups:<place id>" when any
// Meetup or Join changes, and "ratings:<place id>" when any Rating or Condition vote changes
// (SCRUM-98). The page then loads that data again.
// fetch, not EventSource: EventSource cannot send the Authorization header, and the token must
// not go into a URL.

export type LiveTopic = 'notifications' | 'contacts'

type Handlers = {
  // The stream is open. Events sent while it was closed are lost, so load everything again.
  onOpen: () => void
  onTopic: (topic: LiveTopic) => void
  onMeetups: (placeId: number) => void
  onRatings: (placeId: number) => void
}

const FIRST_RETRY_MS = 2_000
const MAX_RETRY_MS = 30_000

// The Place id of "<prefix>:<place id>", or null.
function placeOf(data: string, prefix: 'meetups' | 'ratings'): number | null {
  if (!data.startsWith(`${prefix}:`)) return null
  const placeId = Number(data.slice(prefix.length + 1))
  return Number.isInteger(placeId) ? placeId : null
}

// Calls onData with the `data:` value of each event.
async function readEvents(body: ReadableStream<Uint8Array>, onData: (data: string) => void) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) return
    buffer += decoder.decode(value, { stream: true })
    let end = buffer.indexOf('\n\n')
    while (end >= 0) {
      for (const line of buffer.slice(0, end).split('\n')) {
        if (line.startsWith('data: ')) onData(line.slice('data: '.length))
      }
      buffer = buffer.slice(end + 2)
      end = buffer.indexOf('\n\n')
    }
  }
}

// Connects, and connects again after a break (2 s, then longer up to 30 s). A phone stops the
// stream of a page in the background, so a page that becomes visible opens a fresh one at once.
// Returns the function that closes the stream for good (logout).
export function connectLive(token: string, { onOpen, onTopic, onMeetups, onRatings }: Handlers): () => void {
  let stopped = false
  let controller: AbortController | null = null
  let timer: ReturnType<typeof setTimeout> | undefined
  let retryMs = FIRST_RETRY_MS

  async function run() {
    clearTimeout(timer)
    controller?.abort()
    const own = new AbortController()
    controller = own
    try {
      const response = await fetch('/api/live', {
        headers: { Authorization: `Bearer ${token}` },
        signal: own.signal,
      })
      // The login ended; the logout closes the page's other data too.
      if (response.status === 401) return
      if (response.ok && response.body) {
        await readEvents(response.body, (data) => {
          if (data === 'ready') {
            retryMs = FIRST_RETRY_MS
            onOpen()
            return
          }
          if (data === 'notifications' || data === 'contacts') onTopic(data)
          const meetups = placeOf(data, 'meetups')
          if (meetups !== null) onMeetups(meetups)
          const ratings = placeOf(data, 'ratings')
          if (ratings !== null) onRatings(ratings)
        })
      }
    } catch {
      // Offline, server restart, or aborted: the code below decides.
    }
    if (stopped || own.signal.aborted) return
    timer = setTimeout(run, retryMs)
    retryMs = Math.min(retryMs * 2, MAX_RETRY_MS)
  }

  function onVisibility() {
    if (!stopped && document.visibilityState === 'visible') void run()
  }

  document.addEventListener('visibilitychange', onVisibility)
  void run()
  return () => {
    stopped = true
    clearTimeout(timer)
    controller?.abort()
    document.removeEventListener('visibilitychange', onVisibility)
  }
}

// Changes inside the page: App passes each live event on, and the open parts (the Place panel,
// the Notifications and Contacts dialogs) listen, so they need no extra prop.
const changes = new EventTarget()

type PlaceTopic = 'meetups' | 'ratings'

function announcePlaceChange(topic: PlaceTopic, placeId: number) {
  changes.dispatchEvent(new CustomEvent<number>(topic, { detail: placeId }))
}

// Returns the function that stops listening.
function onPlaceChange(topic: PlaceTopic, listener: (placeId: number) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<number>).detail)
  changes.addEventListener(topic, handle)
  return () => changes.removeEventListener(topic, handle)
}

export const announceMeetupChange = (placeId: number) => announcePlaceChange('meetups', placeId)
export const onMeetupChange = (listener: (placeId: number) => void) => onPlaceChange('meetups', listener)
export const announceRatingChange = (placeId: number) => announcePlaceChange('ratings', placeId)
export const onRatingChange = (listener: (placeId: number) => void) => onPlaceChange('ratings', listener)

export function announceTopicChange(topic: LiveTopic) {
  changes.dispatchEvent(new Event(topic))
}

// Returns the function that stops listening.
export function onTopicChange(topic: LiveTopic, listener: () => void): () => void {
  changes.addEventListener(topic, listener)
  return () => changes.removeEventListener(topic, listener)
}
