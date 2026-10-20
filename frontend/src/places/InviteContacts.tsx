import { useEffect, useState } from 'react'
import { loadToken } from '../api/auth'
import { fetchContacts, type ContactUser } from '../api/contacts'
import { fetchInvited, inviteContacts, type Meetup } from '../api/meetups'

type ChooserProps = {
  meetupId: number
  onClose: () => void
}

function invitedText(count: number): string {
  if (count === 0) return 'Alle Gewählten sind schon dabei oder eingeladen.'
  return `${count} ${count === 1 ? 'Kontakt' : 'Kontakte'} eingeladen.`
}

function toggled(chosen: Set<number>, id: number): Set<number> {
  const next = new Set(chosen)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

// A Contact already in the Meetup or already invited has a tick and no checkbox (SCRUM-84).
function ContactList({ contacts, done, chosen, onToggle }: {
  contacts: ContactUser[]
  done: Set<number>
  chosen: Set<number>
  onToggle: (id: number) => void
}) {
  if (contacts.length === 0) return <p className="hint">Du hast noch keine Kontakte.</p>
  return (
    <ul>
      {contacts.map((contact) => (
        <li key={contact.id}>
          {done.has(contact.id) ? (
            <span className="invited" title="Schon dabei oder eingeladen">
              ✓ {contact.nickname}
            </span>
          ) : (
            <label>
              <input type="checkbox" checked={chosen.has(contact.id)} onChange={() => onToggle(contact.id)} />{' '}
              {contact.nickname}
            </label>
          )}
        </li>
      ))}
    </ul>
  )
}

function ChooserButtons({ canSend, showSend, done, onSend, onClose }: {
  canSend: boolean
  showSend: boolean
  done: boolean
  onSend: () => void
  onClose: () => void
}) {
  return (
    <div className="button-row">
      {showSend && (
        <button type="button" disabled={!canSend} onClick={onSend}>
          Einladen
        </button>
      )}
      <button type="button" className="link-button" onClick={onClose}>
        {done ? 'Fertig' : 'Abbrechen'}
      </button>
    </div>
  )
}

/** The Contacts to choose; "Einladen" sends one invitation each. Who is already in the Meetup
 * or already invited has a tick; the server also leaves out anyone blocked. */
function ContactChooser({ meetupId, onClose }: ChooserProps) {
  const [contacts, setContacts] = useState<ContactUser[] | null>(null)
  const [done, setDone] = useState<Set<number>>(new Set())
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function loadDone() {
    setDone(new Set(await fetchInvited(loadToken() ?? '', meetupId)))
  }

  useEffect(() => {
    Promise.all([fetchContacts(loadToken() ?? ''), fetchInvited(loadToken() ?? '', meetupId)])
      .then(([found, invited]) => {
        setContacts(found.contacts)
        setDone(new Set(invited))
      })
      .catch((err: Error) => setError(err.message))
  }, [meetupId])

  async function send() {
    setBusy(true)
    setError(null)
    try {
      setResult(invitedText(await inviteContacts(loadToken() ?? '', meetupId, [...chosen])))
      setChosen(new Set())
      await loadDone()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="invite-contacts" role="group" aria-label="Kontakte einladen">
      {contacts === null && !error && <p>Lädt …</p>}
      {contacts && <ContactList contacts={contacts} done={done} chosen={chosen} onToggle={(id) => setChosen(toggled(chosen, id))} />}
      {result && <p>{result}</p>}
      {error && <p className="form-error">{error}</p>}
      <ChooserButtons
        canSend={!busy && chosen.size > 0}
        showSend={!!contacts?.length}
        done={result !== null}
        onSend={send}
        onClose={onClose}
      />
    </div>
  )
}

/** "Kontakte einladen" on a Meetup card (SCRUM-43), for everyone in the Meetup (action
 * "invite"). Invited Contacts get a Notification with "Ich komme mit". */
export default function InviteContacts({ meetup }: { meetup: Pick<Meetup, 'id' | 'actions'> }) {
  const [open, setOpen] = useState(false)
  if (!meetup.actions.includes('invite')) return null
  if (open) return <ContactChooser meetupId={meetup.id} onClose={() => setOpen(false)} />
  return (
    <button type="button" onClick={() => setOpen(true)}>
      Kontakte einladen
    </button>
  )
}
