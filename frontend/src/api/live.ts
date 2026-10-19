// Live updates (SCRUM-93): one open stream to GET /api/live per signed-in page. The server sends
// a topic when the user's Notifications or Contacts change, and "meetups:<place id>" when any
// Meetup or Join changes. The page then loads that data again.
// fetch, not EventSource: EventSource cannot send the Authorization header, and the token must
// not go into a URL.

export type LiveTopic = 'notifications' | 'contacts'

type Handlers = {
  // The stream is open. Events sent while it was closed are lost, so load everything again.
  onOpen: () => void
  onTopic: (topic: LiveTopic) => void
  onMeetups: (placeId: number) => void
}

const FIRST_RETRY_MS = 2_000
const MAX_RETRY_MS = 30_000

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
export function connectLive(token: string, { onOpen, onTopic, onMeetups }: Handlers): () => void {
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
          } else if (data === 'notifications' || data === 'contacts') {
            onTopic(data)
          } else if (data.startsWith('meetups:')) {
            const placeId = Number(data.slice('meetups:'.length))
            if (Number.isInteger(placeId)) onMeetups(placeId)
          }
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

// Meetup changes inside the page: App passes each live event on, and the open Place panel
// listens, so the panel needs no extra prop.
const meetupChanges = new EventTarget()

export function announceMeetupChange(placeId: number) {
  meetupChanges.dispatchEvent(new CustomEvent<number>('change', { detail: placeId }))
}

// Returns the function that stops listening.
export function onMeetupChange(listener: (placeId: number) => void): () => void {
  const handle = (event: Event) => listener((event as CustomEvent<number>).detail)
  meetupChanges.addEventListener('change', handle)
  return () => meetupChanges.removeEventListener('change', handle)
}
