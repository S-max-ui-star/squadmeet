import { useEffect, useRef, useState, type FormEvent } from 'react'
import Dialog from '../Dialog'
import { mfaDisable, mfaEnable, mfaSetup, type MfaSetup, type User } from '../api/auth'
import UsernameField from './UsernameField'

type Props = {
  token: string
  user: User
  onChanged: (user: User) => void
  // Opens the dialog for a new set of Recovery codes (SCRUM-33).
  onNewRecoveryCodes: () => void
  onClose: () => void
}

/** Turn two-factor login with an authenticator app on or off (SCRUM-26). */
export default function MfaDialog({ token, user, onChanged, onNewRecoveryCodes, onClose }: Props) {
  const [setup, setSetup] = useState<MfaSetup | null>(null)
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const requestRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(
    () => () => {
      mountedRef.current = false
      requestRef.current += 1
    },
    [],
  )

  async function run<T>(action: () => Promise<T>, apply: (result: T) => void) {
    setError(null)
    setBusy(true)
    const request = ++requestRef.current
    try {
      const result = await action()
      if (mountedRef.current && request === requestRef.current) apply(result)
    } catch (err) {
      if (mountedRef.current && request === requestRef.current) setError((err as Error).message)
    } finally {
      if (mountedRef.current && request === requestRef.current) setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!user.mfa_enabled && !setup) {
      // The password is asked again, so a stolen session token alone cannot turn MFA on.
      run(() => mfaSetup(token, password), (result) => {
        setSetup(result)
        setPassword('')
      })
      return
    }
    run(
      () => (user.mfa_enabled ? mfaDisable(token, password, code) : mfaEnable(token, code)),
      (result) => {
        onChanged(result)
        setSetup(null)
        setCode('')
        setPassword('')
      },
    )
  }

  function close() {
    if (busy) return
    requestRef.current += 1
    onClose()
  }

  const passwordField = (
    <>
      <UsernameField nickname={user.nickname} />
      <label>
        Passwort
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoFocus
          autoComplete="current-password"
        />
      </label>
    </>
  )

  const codeField = (
    <label>
      {user.mfa_enabled ? 'Code aus der App oder Wiederherstellungscode' : 'Code aus der App'}
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        required
        autoFocus={!user.mfa_enabled}
        autoComplete="one-time-code"
        placeholder="123456"
      />
    </label>
  )

  return (
    <Dialog title="Zwei-Faktor-Anmeldung" onSubmit={submit} onClose={close} dismissible={!busy}>
      {user.mfa_enabled ? (
        <>
          <p>
            Die Zwei-Faktor-Anmeldung ist <strong>an</strong>. Beim Anmelden fragen wir nach dem Code
            aus deiner Authenticator-App.
          </p>
          {passwordField}
          {codeField}
          <button type="submit" className="btn-primary" disabled={busy}>
            Ausschalten
          </button>
        </>
      ) : setup ? (
        <>
          <p>
            Nach dem Einschalten melden wir deine anderen Geräte ab. Dort meldest du dich dann mit
            Passwort und Code wieder an.
          </p>
          <p>Scanne den QR-Code mit deiner Authenticator-App (z. B. Google Authenticator).</p>
          <img className="mfa-qr" src={setup.qr_code} alt="QR-Code für die Authenticator-App" />
          <p>
            Oder gib diesen Schlüssel von Hand ein:{' '}
            <code className="mfa-secret">{setup.secret}</code>
          </p>
          {codeField}
          <button type="submit" className="btn-primary" disabled={busy}>
            Bestätigen und einschalten
          </button>
        </>
      ) : (
        <>
          <p>
            Mit der Zwei-Faktor-Anmeldung brauchst du beim Anmelden dein Passwort und einen Code
            aus einer Authenticator-App.
            {user.is_admin && ' Als Admin brauchst du sie für die Admin-Funktionen.'}
          </p>
          {passwordField}
          <button type="submit" className="btn-primary" disabled={busy}>
            Einschalten
          </button>
        </>
      )}

      {error && <p className="form-error">{error}</p>}

      <button type="button" className="link" disabled={busy} onClick={onNewRecoveryCodes}>
        Neue Wiederherstellungscodes erstellen
      </button>
    </Dialog>
  )
}
