import { useState } from 'react'
import Dialog from '../Dialog'

type Props = {
  codes: string[]
  // True when the codes replace an older set (SCRUM-33).
  replaced?: boolean
  onConfirmed: () => void
}

/** Shows the Recovery codes once. The user must confirm that they saved them. */
export default function RecoveryCodes({ codes, replaced = false, onConfirmed }: Props) {
  const [saved, setSaved] = useState(false)
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle')

  async function copyCodes() {
    setCopyStatus('idle')
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable')
      await navigator.clipboard.writeText(codes.join('\n'))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('failed')
    }
  }

  return (
    <Dialog title="Deine Wiederherstellungscodes">
      <p>
        Mit einem dieser Codes setzt du dein Passwort zurück, wenn du es vergisst. Jeder Code gilt
        einmal. Wir zeigen sie <strong>nur jetzt</strong> an und haben keine E-Mail-Adresse von dir.
        Speichere sie an einem sicheren Ort.
        {replaced && ' Deine alten Codes gelten nicht mehr.'}
      </p>
      <ul className="codes">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <button type="button" onClick={copyCodes}>
        Codes kopieren
      </button>
      {copyStatus === 'copied' && <p role="status">Codes kopiert.</p>}
      {copyStatus === 'failed' && (
        <p role="alert" className="form-error">
          Kopieren ist nicht möglich. Bitte markiere die Codes und kopiere sie von Hand.
        </p>
      )}
      <label className="checkbox">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Ich habe die Codes sicher gespeichert
      </label>
      <button type="button" className="btn-primary" disabled={!saved} onClick={onConfirmed}>
        Weiter
      </button>
    </Dialog>
  )
}
