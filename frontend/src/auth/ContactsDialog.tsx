import { useCallback, useEffect, useState } from 'react'
import Dialog from '../Dialog'
import {
  acceptRequest,
  askForContact,
  blockUser,
  declineRequest,
  fetchContacts,
  removeContact,
  unblockUser,
  withdrawRequest,
  type ContactUser,
  type Contacts,
} from '../api/contacts'
import { onTopicChange } from '../api/live'
import { AVATARS } from './avatars'

type Props = {
  token: string
  // After every change, so the "Konto" button can show the new number of open requests.
  onChanged: (contacts: Contacts) => void
  onClose: () => void
}

function name(user: ContactUser) {
  return `${AVATARS[user.avatar]?.emoji ?? ''} ${user.nickname}`
}

/** One Contact with "Entfernen" and "Blockieren". "Blockieren" asks first, because blocking
 * also deletes the Contact (SCRUM-84). */
function ContactRow({ contact, busy, onRemove, onBlock }: {
  contact: ContactUser
  busy: boolean
  onRemove: () => void
  onBlock: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  if (confirming) {
    return (
      <li className="confirm">
        <span>{contact.nickname} blockieren? Die Person wird aus deinen Kontakten gelöscht.</span>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => {
            setConfirming(false)
            onBlock()
          }}
        >
          Ja, blockieren
        </button>
        <button type="button" disabled={busy} onClick={() => setConfirming(false)}>
          Abbrechen
        </button>
      </li>
    )
  }
  return (
    <li>
      <span>{name(contact)}</span>
      <button type="button" disabled={busy} onClick={onRemove}>
        Entfernen
      </button>
      <button type="button" disabled={busy} onClick={() => setConfirming(true)}>
        Blockieren
      </button>
    </li>
  )
}

/** "Kontakte" (SCRUM-32): Contacts, requests both ways, a new request by the exact Nickname,
 * and the users this user blocked. No chat (ADR-0004). */
export default function ContactsDialog({ token, onChanged, onClose }: Props) {
  const [data, setData] = useState<Contacts | null>(null)
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(
    () =>
      fetchContacts(token)
        .then((found) => {
          setData(found)
          onChanged(found)
        })
        .catch((err: Error) => setError(err.message)),
    [token, onChanged],
  )

  // Loads now and again on each live event while open (SCRUM-93).
  useEffect(() => {
    void reload()
    return onTopicChange('contacts', () => void reload())
  }, [reload])

  // True when the action worked, so the caller can clear its input only then (SCRUM-147).
  async function run(action: () => Promise<unknown>, done?: string): Promise<boolean> {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action()
      if (done) setNotice(done)
      await reload()
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Kontakte" className="contacts" onClose={onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const asked = nickname.trim()
          run(() => askForContact(token, asked), `Anfrage an ${asked} gesendet`).then((sent) => sent && setNickname(''))
        }}
      >
        <label>
          Kontakt hinzufügen (genauer Nickname)
          <input value={nickname} onChange={(event) => setNickname(event.target.value)} required />
        </label>
        <button type="submit" disabled={busy || nickname.trim() === ''}>
          Anfragen
        </button>
      </form>
      {notice && <p className="hint">{notice}</p>}
      {error && <p className="form-error">{error}</p>}
      {data === null && !error && <p>Lädt …</p>}

      {data && data.incoming.length > 0 && (
        <section>
          <h3>Anfragen an dich</h3>
          <ul className="contact-list">
            {data.incoming.map((request) => (
              <li key={request.id}>
                <span>{name(request.user)}</span>
                <button type="button" disabled={busy} onClick={() => run(() => acceptRequest(token, request.id))}>
                  Annehmen
                </button>
                <button type="button" disabled={busy} onClick={() => run(() => declineRequest(token, request.id))}>
                  Ablehnen
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && (
        <section>
          <h3>Deine Kontakte</h3>
          {data.contacts.length === 0 && <p className="hint">Noch keine Kontakte.</p>}
          <ul className="contact-list">
            {data.contacts.map((contact) => (
              <ContactRow
                key={contact.id}
                contact={contact}
                busy={busy}
                onRemove={() => run(() => removeContact(token, contact.id))}
                onBlock={() => run(() => blockUser(token, contact.nickname))}
              />
            ))}
          </ul>
        </section>
      )}

      {data && data.outgoing.length > 0 && (
        <section>
          <h3>Deine Anfragen</h3>
          <ul className="contact-list">
            {data.outgoing.map((request) => (
              <li key={request.id}>
                <span>
                  {name(request.user)} <small>{request.status === 'declined' ? 'abgelehnt' : 'wartet'}</small>
                </span>
                {request.status === 'declined' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run(() => askForContact(token, request.user.nickname), 'Neu angefragt')}
                  >
                    Neu anfragen
                  </button>
                )}
                <button type="button" disabled={busy} onClick={() => run(() => withdrawRequest(token, request.id))}>
                  {request.status === 'declined' ? 'Ausblenden' : 'Zurückziehen'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.blocked.length > 0 && (
        <section>
          <h3>Blockiert</h3>
          <ul className="contact-list">
            {data.blocked.map((blocked) => (
              <li key={blocked.id}>
                <span>{name(blocked)}</span>
                <button type="button" disabled={busy} onClick={() => run(() => unblockUser(token, blocked.id))}>
                  Aufheben
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

    </Dialog>
  )
}
