import { useState, type FormEvent } from 'react'
import Dialog from '../Dialog'
import { newRecoveryCodes, type User } from '../api/auth'
import PasswordAndCodeFields from './PasswordAndCodeFields'
import RecoveryCodes from './RecoveryCodes'

type Props = {
  token: string
  user: User
  onClose: () => void
}

/** A new set of Recovery codes; the old set stops working (SCRUM-33). */
export default function RecoveryCodesDialog({ token, user, onClose }: Props) {
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [codes, setCodes] = useState<string[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      setCodes(await newRecoveryCodes(token, password, user.mfa_enabled ? code : undefined))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (codes) {
    return <RecoveryCodes codes={codes} replaced onConfirmed={onClose} />
  }

  return (
    <Dialog
      title="Neue Wiederherstellungscodes"
      onSubmit={submit}
      onClose={onClose}
      dismissible={!busy}
    >
      <p>
        Du bekommst 10 neue Codes. Deine alten Codes gelten danach nicht mehr, auch die noch nicht
        benutzten.
      </p>
      <PasswordAndCodeFields
        user={user}
        password={password}
        onPassword={setPassword}
        code={code}
        onCode={setCode}
      />

      {error && <p className="form-error">{error}</p>}

      <button type="submit" disabled={busy}>
        Neue Codes erstellen
      </button>
      <button type="button" className="link" disabled={busy} onClick={onClose}>
        Abbrechen
      </button>
    </Dialog>
  )
}
