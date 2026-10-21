import type { Dispatch, SetStateAction } from 'react'
import type { User } from '../api/auth'
import { askForContact, blockUser } from '../api/contacts'
import {
  answerMove,
  cancelMeetup,
  cancelSeries,
  endMeetup,
  joinMeetup,
  leaveMeetup,
  moveMeetupStart,
  type Meetup,
  type MeetupAction,
  type MoveAnswer,
} from '../api/meetups'
import { AVATARS } from '../auth/avatars'
import InviteContacts from './InviteContacts'
import PartySizeStepper from './PartySizeStepper'
import { fromInputValue, inputBounds, slot, startChoice, toInputValue } from './meetupTime'

type Person = { meetupId: number; nickname: string }
type Joining = { id: number; partySize: number }
type Moving = { id: number; startsAt: string }
type Run = (action: (token: string) => Promise<unknown>) => Promise<boolean>

type Props = {
  meetup: Meetup
  user: User | null
  laterCount: number
  offered: boolean
  busy: boolean
  now: Date
  joining: Joining | null
  moving: Moving | null
  person: Person | null
  expanded: boolean
  cancellableSeriesId: number | null
  setJoining: Dispatch<SetStateAction<Joining | null>>
  setMoving: Dispatch<SetStateAction<Moving | null>>
  setPerson: Dispatch<SetStateAction<Person | null>>
  setNotice: Dispatch<SetStateAction<string | null>>
  onToggleExpanded: () => void
  onLoginNeeded: () => void
  run: Run
}

const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })
const people = (count: number) => (count === 1 ? '1 Person' : `${count} Personen`)

function PersonButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="person-button" onClick={onClick}>
      {label}
    </button>
  )
}

function MeetupIdentity({
  meetup,
  user,
  onPerson,
}: {
  meetup: Meetup
  user: User | null
  onPerson: (person: Person) => void
}) {
  const live = meetup.state === 'live'
  const isHost = user !== null && user.id === meetup.host?.id
  return (
    <div>
      {meetup.state === 'cancelled' && <><span className="cancelled-tag">Abgesagt</span>{' '}</>}
      {meetup.series_id !== null && <><span className="series-tag" title="Termin einer wöchentlichen Serie">🔁</span>{' '}</>}
      {live ? <><span className="live">LIVE</span> bis {time.format(new Date(meetup.ends_at))} Uhr</> : slot(meetup)}
      {meetup.host && (
        <>
          <br />
          {isHost ? (
            `${AVATARS[meetup.host.avatar]?.emoji ?? ''} ${meetup.host.nickname} (du, Gastgeber)`
          ) : (
            <PersonButton
              label={`${AVATARS[meetup.host.avatar]?.emoji ?? ''} ${meetup.host.nickname}`}
              onClick={() => onPerson({ meetupId: meetup.id, nickname: meetup.host!.nickname })}
            />
          )}
        </>
      )}
      {meetup.participants && meetup.participants.length > 0 && (
        <>
          <br />
          <span className="participants">
            Dabei:{' '}
            {meetup.participants.map((participant, index) => {
              const label = `${AVATARS[participant.avatar]?.emoji ?? ''} ${participant.nickname}${participant.party_size > 1 ? ` (${participant.party_size})` : ''}`
              return (
                <span key={participant.id}>
                  {index > 0 && ', '}
                  {participant.id === user?.id ? label : (
                    <PersonButton
                      label={label}
                      onClick={() => onPerson({ meetupId: meetup.id, nickname: participant.nickname })}
                    />
                  )}
                </span>
              )
            })}
          </span>
        </>
      )}
      {meetup.blocked_user_in && <><br /><span className="blocked-warning">⚠️ Jemand, den du blockiert hast, ist dabei</span></>}
    </div>
  )
}

function PersonActions({ person, busy, run, onClose, setNotice }: {
  person: Person
  busy: boolean
  run: Run
  onClose: () => void
  setNotice: Dispatch<SetStateAction<string | null>>
}) {
  return (
    <div className="person-actions" role="group" aria-label={person.nickname}>
      <strong>{person.nickname}</strong>
      <button type="button" disabled={busy} onClick={() => run((token) => askForContact(token, person.nickname)).then((ok) => ok && setNotice(`Kontaktanfrage an ${person.nickname} gesendet`))}>
        Als Kontakt anfragen
      </button>
      <button type="button" disabled={busy} onClick={() => run((token) => blockUser(token, person.nickname)).then((ok) => ok && setNotice(`${person.nickname} ist blockiert`))}>
        Blockieren
      </button>
      <button type="button" className="link-button" onClick={onClose}>Abbrechen</button>
    </div>
  )
}

function MeetupAnswers({ meetup, offered, joining, busy, onAnswer, onJoin, onLeave }: {
  meetup: Meetup
  offered: boolean
  joining: boolean
  busy: boolean
  onAnswer: (choice: MoveAnswer) => void
  onJoin: () => void
  onLeave: () => void
}) {
  const offer = meetup.move_offer
  return (
    <>
      {offer && (
        <div className="move-offer" role="group" aria-label="Neue Zeit">
          <p>{AVATARS[offer.host.avatar]?.emoji} {offer.host.nickname} hat das Treffen auf{' '}{startChoice(offer.starts_at, meetup.starts_at)} verlegt. Wann bist du dabei?</p>
          {([
            ['go', startChoice(offer.starts_at, meetup.starts_at)],
            ['stay', startChoice(meetup.starts_at, offer.starts_at)],
            ['leave', 'Gar nicht'],
          ] as const).map(([choice, label]) => (
            <button key={choice} type="button" disabled={busy} onClick={() => onAnswer(choice)}>{label}</button>
          ))}
        </div>
      )}
      {meetup.actions.includes('join') && !joining && !offered && <button type="button" disabled={busy} onClick={onJoin}>Ich komme mit</button>}
      {meetup.actions.includes('leave') && !offer && <button type="button" disabled={busy} onClick={onLeave}>Verlassen</button>}
    </>
  )
}

function JoinForm({ meetup, joining, busy, setJoining, run }: {
  meetup: Meetup
  joining: Joining
  busy: boolean
  setJoining: Dispatch<SetStateAction<Joining | null>>
  run: Run
}) {
  return (
    <form className="move-form" onSubmit={(event) => {
      event.preventDefault()
      run((token) => joinMeetup(token, meetup.id, joining.partySize))
    }}>
      <PartySizeStepper value={joining.partySize} onChange={(partySize) => setJoining({ id: meetup.id, partySize })} />
      <button type="submit" disabled={busy}>Beitreten</button>
      <button type="button" className="link-button" onClick={() => setJoining(null)}>Abbrechen</button>
    </form>
  )
}

function MoveForm({ meetup, moving, busy, now, setMoving, run }: {
  meetup: Meetup
  moving: Moving
  busy: boolean
  now: Date
  setMoving: Dispatch<SetStateAction<Moving | null>>
  run: Run
}) {
  const bounds = inputBounds(now)
  return (
    <form className="move-form" onSubmit={(event) => {
      event.preventDefault()
      run((token) => moveMeetupStart(token, meetup.id, fromInputValue(moving.startsAt)))
    }}>
      {(meetup.participants?.length ?? 0) > 0 && <p className="hint">Die anderen werden gefragt, ob sie zur neuen oder zur alten Zeit dabei sind.</p>}
      <label className="field">
        Neuer Beginn
        <input type="datetime-local" required value={moving.startsAt} min={bounds.min} max={bounds.max} onChange={(event) => setMoving({ id: meetup.id, startsAt: event.target.value })} />
      </label>
      <button type="submit" disabled={busy}>Speichern</button>
      <button type="button" className="link-button" onClick={() => setMoving(null)}>Abbrechen</button>
    </form>
  )
}

export default function MeetupCard(props: Props) {
  const { meetup, user, laterCount, offered, busy, now, joining, moving, person, expanded,
    cancellableSeriesId, setJoining, setMoving, setPerson, setNotice, onToggleExpanded,
    onLoginNeeded, run } = props
  const can = (action: MeetupAction) => meetup.actions.includes(action)
  const live = meetup.state === 'live'
  return (
    <li id={`treffen-${meetup.id}`} className={live ? 'meetup-card' : meetup.state === 'cancelled' ? 'meetup-card cancelled' : 'meetup-card later'}>
      <MeetupIdentity meetup={meetup} user={user} onPerson={setPerson} />
      {person?.meetupId === meetup.id && <PersonActions person={person} busy={busy} run={run} onClose={() => setPerson(null)} setNotice={setNotice} />}
      <strong className="meetup-people">{people(meetup.people)}</strong>
      <MeetupAnswers
        meetup={meetup}
        offered={offered}
        joining={joining?.id === meetup.id}
        busy={busy}
        onAnswer={(choice) => run((token) => answerMove(token, meetup.id, choice))}
        onJoin={() => user ? setJoining({ id: meetup.id, partySize: 1 }) : onLoginNeeded()}
        onLeave={() => run((token) => leaveMeetup(token, meetup.id))}
      />
      <InviteContacts meetup={meetup} />
      {joining?.id === meetup.id && <JoinForm meetup={meetup} joining={joining} busy={busy} setJoining={setJoining} run={run} />}
      {laterCount > 0 && meetup.series_id !== null && (
        <button type="button" className="link-button" aria-expanded={expanded} onClick={onToggleExpanded}>
          Alle Termine ({laterCount + 1}) {expanded ? '▴' : '▾'}
        </button>
      )}
      {cancellableSeriesId !== null && laterCount > 0 && <button type="button" disabled={busy} onClick={() => run((token) => cancelSeries(token, cancellableSeriesId))}>Serie absagen</button>}
      {can('end') && <button type="button" disabled={busy} onClick={() => run((token) => endMeetup(token, meetup.id))}>Jetzt beenden</button>}
      {can('cancel') && <button type="button" disabled={busy} onClick={() => run((token) => cancelMeetup(token, meetup.id))}>Absagen</button>}
      {can('move') && moving?.id !== meetup.id && <button type="button" disabled={busy} onClick={() => setMoving({ id: meetup.id, startsAt: toInputValue(new Date(meetup.starts_at)) })}>Zeit ändern</button>}
      {moving?.id === meetup.id && <MoveForm meetup={meetup} moving={moving} busy={busy} now={now} setMoving={setMoving} run={run} />}
    </li>
  )
}
