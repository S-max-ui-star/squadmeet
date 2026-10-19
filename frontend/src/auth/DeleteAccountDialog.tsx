import { useState, type FormEvent } from 'react'
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
    <div className="dialog-backdrop">
      <form className="dialog" onSubmit={submit}>
        <h2>Konto löschen</h2>
        <p>
          Wir löschen dein Konto <strong>{user.nickname}</strong> und alle Daten dazu: Nickname,
          Avatar, Passwort, Wiederherstellungscodes und deine Treffen. Das geht nicht rückgängig.
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
        <button type="button" className="link" onClick={onClose}>
          Abbrechen
        </button>
        <LegalLinks className="legal-links-inline" />
      </form>
    </div>
  )
}
