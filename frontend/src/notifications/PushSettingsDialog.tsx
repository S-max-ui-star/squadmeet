import { useEffect, useState } from 'react'
import { fetchPushConfig, removePushSubscription, savePushSubscription } from '../api/push'
import { applicationServerKey, needsIosHomeScreen, pushSupported, runsStandalone } from './push'
import Dialog from '../Dialog'

type Props = { token: string; onClose: () => void }
type State = 'loading' | 'off' | 'on' | 'unsupported' | 'server-disabled'

export default function PushSettingsDialog({ token, onClose }: Props) {
  const [state, setState] = useState<State>('loading')
  const [publicKey, setPublicKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // While "einschalten" or "ausschalten" runs, so a second tap sends nothing (SCRUM-147).
  const [busy, setBusy] = useState(false)
  const iosNeedsInstall = needsIosHomeScreen(navigator.userAgent, runsStandalone())

  useEffect(() => {
    let current = true
    fetchPushConfig(token)
      .then(async (config) => {
        if (!current) return
        if (!config.enabled || !config.public_key) {
          setState('server-disabled')
          return
        }
        setPublicKey(config.public_key)
        if (!pushSupported() || iosNeedsInstall) {
          setState('unsupported')
          return
        }
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          // A shared browser may have been used by another account before this login.
          await savePushSubscription(token, subscription)
        }
        if (current) setState(subscription ? 'on' : 'off')
      })
      .catch((reason: Error) => current && setError(reason.message))
    return () => {
      current = false
    }
  }, [iosNeedsInstall, token])

  async function enable() {
    if (!publicKey) return
    setError(null)
    setBusy(true)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Push wurde im Browser nicht erlaubt.')
        return
      }
      const registration = await navigator.serviceWorker.ready
      const existing = await registration.pushManager.getSubscription()
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: applicationServerKey(publicKey),
      })
      await savePushSubscription(token, subscription)
      setState('on')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Push konnte nicht eingeschaltet werden.')
    } finally {
      setBusy(false)
    }
  }

  async function disable() {
    setError(null)
    setBusy(true)
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await removePushSubscription(token, subscription.endpoint)
        await subscription.unsubscribe()
      }
      setState('off')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Push konnte nicht ausgeschaltet werden.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Push-Benachrichtigungen" onClose={onClose}>
      {state === 'loading' && <p>Laden …</p>}
      {state === 'server-disabled' && <p>Push ist auf diesem Server noch nicht eingerichtet.</p>}
      {iosNeedsInstall && (
        <p>Auf dem iPhone musst du SquadMeet zuerst zum Home-Bildschirm hinzufügen und von dort öffnen.</p>
      )}
      {state === 'unsupported' && !iosNeedsInstall && <p>Dieser Browser unterstützt keine Push-Benachrichtigungen.</p>}
      {state === 'off' && (
        <button type="button" className="btn-primary" disabled={busy} onClick={enable}>Push einschalten</button>
      )}
      {state === 'on' && (
        <>
          <p>Push ist eingeschaltet.</p>
          <button type="button" disabled={busy} onClick={disable}>Push ausschalten</button>
        </>
      )}
      {error && <p className="form-error">{error}</p>}
    </Dialog>
  )
}
