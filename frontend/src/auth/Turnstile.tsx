import { useEffect, useRef, useState } from 'react'
import { fetchCaptchaSiteKey } from '../api/auth'

// Cloudflare Turnstile, the captcha (SCRUM-27). The script loads only when a form shows the
// widget, so a visit to the map alone sends nothing to Cloudflare.
const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      language: string
      size: 'normal' | 'compact'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    },
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

let scriptLoad: Promise<TurnstileApi> | null = null

function loadTurnstile(): Promise<TurnstileApi> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error('no turnstile'))
    script.onerror = () => {
      // The next widget tries again (for example after the network is back).
      scriptLoad = null
      script.remove()
      reject(new Error('Turnstile script failed to load'))
    }
    document.head.appendChild(script)
  })
  return scriptLoad
}

type Props = {
  // The token when the check passed; null when it expired or failed.
  onToken: (token: string | null) => void
}

/**
 * The Turnstile widget. A token works only once: after each try, the form mounts a new
 * widget (a new React `key`), which gets a new token.
 */
export default function Turnstile({ onToken }: Props) {
  const container = useRef<HTMLDivElement>(null)
  // The latest callback, so the widget is not rendered again when the parent re-renders.
  const onTokenRef = useRef(onToken)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    onTokenRef.current = onToken
  })

  useEffect(() => {
    let widgetId: string | null = null
    let cancelled = false
    Promise.all([fetchCaptchaSiteKey(), loadTurnstile()])
      .then(([siteKey, turnstile]) => {
        if (cancelled || !container.current) return
        if (!siteKey) throw new Error('no site key')
        widgetId = turnstile.render(container.current, {
          sitekey: siteKey,
          language: 'de',
          // The normal widget is 300 px wide; on a 320 px phone the dialog is narrower (SCRUM-113).
          size: container.current.clientWidth < 300 ? 'compact' : 'normal',
          callback: (token) => onTokenRef.current(token),
          'expired-callback': () => onTokenRef.current(null),
          'error-callback': () => onTokenRef.current(null),
        })
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (widgetId !== null) window.turnstile?.remove(widgetId)
    }
  }, [])

  return (
    <div className="captcha">
      <div ref={container} />
      {failed && (
        <p className="form-error">
          Die Bot-Prüfung konnte nicht laden. Bitte lade die Seite neu.
        </p>
      )}
    </div>
  )
}
