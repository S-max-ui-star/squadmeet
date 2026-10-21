import { useState, type FormEvent } from 'react'
import Dialog from '../Dialog'
import { deleteAccount, type User } from '../api/auth'
import LegalLinks from '../legal/LegalLinks'
import PasswordAndCodeFields from './PasswordAndCodeFields'

type Props = {
  token: string
  user: User
  onDeleted: () => void
  onClose: () => void
}

/** "Konto löschen" (SCRUM-28): asks for the password (and the code with MFA), then deletes. */
export default function DeleteAccountDialog({ token, user, onDeleted, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await deleteAccount(token, password, user.mfa_enabled ? code : undefined)
      onDeleted()
    } catch (err) {
      setError((err as Error).message)
      setBusy(false)
    }
  }

  return (
    <Dialog title="Konto löschen" onSubmit={submit} onClose={onClose} dismissible={!busy}>
      <p>
        Wir löschen dein Konto <strong>{user.nickname}</strong> und deine persönlichen Daten.
        Offene Treffen mit Teilnehmenden können ohne Verbindung zu deinem Konto weiterlaufen. Das
        geht nicht rückgängig.
      </p>
      <PasswordAndCodeFields
        user={user}
        password={password}
        onPassword={setPassword}
        code={code}
        onCode={setCode}
      />

      {error && <p className="form-error">{error}</p>}

      <button type="submit" className="danger" disabled={busy}>
        Konto endgültig löschen
      </button>
      <button type="button" className="link" disabled={busy} onClick={onClose}>
        Abbrechen
      </button>
      <LegalLinks className="legal-links-inline" />
    </Dialog>
  )
}
