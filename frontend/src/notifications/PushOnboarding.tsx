import { useEffect, useState } from 'react'
import { fetchPushConfig, savePushSubscription } from '../api/push'
import { needsIosHomeScreen, pushSupported, runsStandalone } from './push'
import Dialog from '../Dialog'

type Props = {
  userId: number
  token: string
  onConfigure: () => void
}

const promptKey = (userId: number) => `squadmeet.push-onboarding.${userId}`

export default function PushOnboarding({ userId, token, onConfigure }: Props) {
  const [visible, setVisible] = useState(false)
  const iosNeedsInstall = needsIosHomeScreen(navigator.userAgent, runsStandalone())

  useEffect(() => {
    if (localStorage.getItem(promptKey(userId))) return
    let current = true
    fetchPushConfig(token)
      .then(async (config) => {
        if (!current || !config.enabled || !config.public_key) return
        if (iosNeedsInstall) {
          setVisible(true)
          return
        }
        if (!pushSupported() || Notification.permission === 'denied') return
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (subscription) {
          // Keep an existing browser subscription assigned to the account that is signed in now.
          await savePushSubscription(token, subscription)
          localStorage.setItem(promptKey(userId), 'enabled')
          return
        }
        if (current) setVisible(true)
      })
      .catch(() => {})
    return () => {
      current = false
    }
  }, [iosNeedsInstall, token, userId])

  function choose(value: 'configure' | 'later') {
    localStorage.setItem(promptKey(userId), value)
    setVisible(false)
  }

  if (!visible) return null
  return (
    // Escape and × mean "Später" (SCRUM-147).
    <Dialog title="Push-Benachrichtigungen?" onClose={() => choose('later')}>
      <p>Möchtest du neue Benachrichtigungen auch erhalten, wenn SquadMeet gerade geschlossen ist?</p>
      {iosNeedsInstall && <p>Auf dem iPhone musst du SquadMeet dafür zuerst zum Home-Bildschirm hinzufügen.</p>}
      <button
        type="button"
        onClick={() => {
          choose('configure')
          onConfigure()
        }}
      >
        Push einrichten
      </button>
      <button type="button" className="link" onClick={() => choose('later')}>
        Später
      </button>
      <p className="hint">Du kannst Push jederzeit unter Konto → Push-Benachrichtigungen einschalten.</p>
    </Dialog>
  )
}
