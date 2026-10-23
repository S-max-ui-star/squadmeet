import { useState, type Dispatch, type SetStateAction } from 'react'
import type { User } from '../api/auth'
import { askForContact, blockUser } from '../api/contacts'
import {
  answerMove,
  cancelMeetup,
  cancelSeries,
  changeEquipment,
  endMeetup,
  joinMeetup,
  leaveMeetup,
  moveMeetupStart,
  type EquipmentCount,
  type Meetup,
  type MeetupAction,
  type MoveAnswer,
} from '../api/meetups'
import { AVATARS } from '../auth/avatars'
import EquipmentPicker from './EquipmentPicker'
import { equipmentLine } from './equipment'
import InviteContacts from './InviteContacts'
import PartySizeStepper from './PartySizeStepper'
import { fromInputValue, inputBounds, slot, startChoice, toInputValue } from './meetupTime'

type Person = { meetupId: number; nickname: string }
type Joining = { id: number; partySize: number; equipment: EquipmentCount[] }
type Moving = { id: number; startsAt: string }
type Run = (action: (token: string) => Promise<unknown>) => Promise<boolean>

type Props = {
  meetup: Meetup
  // The Place's Activity type: which Equipment fits (SCRUM-170).
  activityType?: string | null
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

function MeetupStateLabel({ meetup }: { meetup: Meetup }) {
  const live = meetup.state === 'live'
  return (
    <>
      {meetup.state === 'cancelled' && <><span className="cancelled-tag">Abgesagt</span>{' '}</>}
      {meetup.series_id !== null && <><span className="series-tag" title="Termin einer wöchentlichen Serie">🔁</span>{' '}</>}
      {live ? <><span className="live">LIVE</span> bis {time.format(new Date(meetup.ends_at))} Uhr</> : slot(meetup)}
    </>
  )
}

function MeetupHost({ meetup, user, onPerson }: { meetup: Meetup; user: User | null; onPerson: (person: Person) => void }) {
  if (!meetup.host) return null
  if (user?.id === meetup.host.id) return <><br />{AVATARS[meetup.host.avatar]?.emoji ?? ''} {meetup.host.nickname} (du, Gastgeber)</>
  return <><br /><PersonButton label={`${AVATARS[meetup.host.avatar]?.emoji ?? ''} ${meetup.host.nickname}`} onClick={() => onPerson({ meetupId: meetup.id, nickname: meetup.host!.nickname })} /></>
}

function MeetupParticipants({ meetup, user, onPerson }: { meetup: Meetup; user: User | null; onPerson: (person: Person) => void }) {
  if (!meetup.participants?.length) return null
  return <><br /><span className="participants">Dabei:{' '}{meetup.participants.map((participant, index) => {
    const label = `${AVATARS[participant.avatar]?.emoji ?? ''} ${participant.nickname}${participant.party_size > 1 ? ` (${participant.party_size})` : ''}`
    return <span key={participant.id}>{index > 0 && ', '}{participant.id === user?.id ? label : <PersonButton label={label} onClick={() => onPerson({ meetupId: meetup.id, nickname: participant.nickname })} />}</span>
  })}</span></>
}

function MeetupIdentity({ meetup, user, onPerson }: { meetup: Meetup; user: User | null; onPerson: (person: Person) => void }) {
  return (
    <div>
      <MeetupStateLabel meetup={meetup} />
      <MeetupHost meetup={meetup} user={user} onPerson={onPerson} />
      <MeetupParticipants meetup={meetup} user={user} onPerson={onPerson} />
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

function JoinForm({ meetup, activityType, joining, busy, setJoining, run }: {
  meetup: Meetup
  activityType?: string | null
  joining: Joining
  busy: boolean
  setJoining: Dispatch<SetStateAction<Joining | null>>
  run: Run
}) {
  return (
    <form className="move-form" onSubmit={(event) => {
      event.preventDefault()
      run((token) => joinMeetup(token, meetup.id, joining.partySize, joining.equipment))
    }}>
      <PartySizeStepper value={joining.partySize} onChange={(partySize) => setJoining({ ...joining, partySize })} />
      <EquipmentPicker activityType={activityType} value={joining.equipment} onChange={(equipment) => setJoining({ ...joining, equipment })} />
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

function SelectedPersonActions({ meetupId, person, busy, run, setPerson, setNotice }: {
  meetupId: number
  person: Person | null
  busy: boolean
  run: Run
  setPerson: Dispatch<SetStateAction<Person | null>>
  setNotice: Dispatch<SetStateAction<string | null>>
}) {
  if (!person || person.meetupId !== meetupId) return null
  return <PersonActions person={person} busy={busy} run={run} onClose={() => setPerson(null)} setNotice={setNotice} />
}

function SelectedJoinForm({ meetup, activityType, joining, busy, setJoining, run }: {
  meetup: Meetup
  activityType?: string | null
  joining: Joining | null
  busy: boolean
  setJoining: Dispatch<SetStateAction<Joining | null>>
  run: Run
}) {
  if (!joining || joining.id !== meetup.id) return null
  return <JoinForm meetup={meetup} activityType={activityType} joining={joining} busy={busy} setJoining={setJoining} run={run} />
}

// The viewer's own items, to start "Ausrüstung ändern" from.
const mine = (meetup: Meetup, user: User | null) =>
  meetup.equipment_by_person?.find((person) => person.id === user?.id)?.items ?? []

// SCRUM-170: one summary line for everybody, and "Ausrüstung ▸" (closed by default) with who
// brings what.
function EquipmentSummary({ meetup, activityType, user }: {
  meetup: Meetup
  activityType?: string | null
  user: User | null
}) {
  const [listOpen, setListOpen] = useState(false)
  const people = meetup.equipment_by_person ?? []
  return (
    <>
      {meetup.equipment.length > 0 && <p className="equipment-line">Mitgebracht: {equipmentLine(activityType, meetup.equipment)}</p>}
      {people.length > 0 && (
        <button type="button" className="link-button" aria-expanded={listOpen} onClick={() => setListOpen(!listOpen)}>
          Ausrüstung {listOpen ? '▾' : '▸'}
        </button>
      )}
      {listOpen && (
        <ul className="equipment-people">
          {people.map((person) => (
            <li key={person.id}>
              {AVATARS[person.avatar]?.emoji ?? ''} {person.id === user?.id ? 'du' : person.nickname}: {equipmentLine(activityType, person.items)}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

// "Ausrüstung ändern" for the people in the Meetup, starting from what the user brings.
function EquipmentChange({ meetup, activityType, user, busy, run }: {
  meetup: Meetup
  activityType?: string | null
  user: User | null
  busy: boolean
  run: Run
}) {
  const [editing, setEditing] = useState<EquipmentCount[] | null>(null)
  if (editing === null) {
    if (!meetup.actions.includes('equipment')) return null
    return <button type="button" disabled={busy} onClick={() => setEditing(mine(meetup, user))}>Ausrüstung ändern</button>
  }
  return (
    <form className="move-form" onSubmit={(event) => {
      event.preventDefault()
      run((token) => changeEquipment(token, meetup.id, editing)).then((ok) => ok && setEditing(null))
    }}>
      <EquipmentPicker activityType={activityType} value={editing} onChange={setEditing} defaultOpen />
      <button type="submit" disabled={busy}>Speichern</button>
      <button type="button" className="link-button" onClick={() => setEditing(null)}>Abbrechen</button>
    </form>
  )
}

function SeriesControls({ meetup, laterCount, expanded, cancellableSeriesId, busy, onToggleExpanded, run }: {
  meetup: Meetup
  laterCount: number
  expanded: boolean
  cancellableSeriesId: number | null
  busy: boolean
  onToggleExpanded: () => void
  run: Run
}) {
  if (laterCount === 0 || meetup.series_id === null) return null
  return (
    <>
      <button type="button" className="link-button" aria-expanded={expanded} onClick={onToggleExpanded}>
        Alle Termine ({laterCount + 1}) {expanded ? '▴' : '▾'}
      </button>
      {cancellableSeriesId !== null && <button type="button" disabled={busy} onClick={() => run((token) => cancelSeries(token, cancellableSeriesId))}>Serie absagen</button>}
    </>
  )
}

function LifecycleControls({ meetup, moving, busy, now, setMoving, run }: {
  meetup: Meetup
  moving: Moving | null
  busy: boolean
  now: Date
  setMoving: Dispatch<SetStateAction<Moving | null>>
  run: Run
}) {
  const can = (action: MeetupAction) => meetup.actions.includes(action)
  return (
    <>
      {can('end') && <button type="button" disabled={busy} onClick={() => run((token) => endMeetup(token, meetup.id))}>Jetzt beenden</button>}
      {can('cancel') && <button type="button" disabled={busy} onClick={() => run((token) => cancelMeetup(token, meetup.id))}>Absagen</button>}
      {can('move') && moving?.id !== meetup.id && <button type="button" disabled={busy} onClick={() => setMoving({ id: meetup.id, startsAt: toInputValue(new Date(meetup.starts_at)) })}>Zeit ändern</button>}
      {moving?.id === meetup.id && <MoveForm meetup={meetup} moving={moving} busy={busy} now={now} setMoving={setMoving} run={run} />}
    </>
  )
}

export default function MeetupCard(props: Props) {
  const { meetup, activityType, user, laterCount, offered, busy, now, joining, moving, person, expanded,
    cancellableSeriesId, setJoining, setMoving, setPerson, setNotice, onToggleExpanded,
    onLoginNeeded, run } = props
  const live = meetup.state === 'live'
  return (
    <li id={`treffen-${meetup.id}`} className={live ? 'meetup-card' : meetup.state === 'cancelled' ? 'meetup-card cancelled' : 'meetup-card later'}>
      <MeetupIdentity meetup={meetup} user={user} onPerson={setPerson} />
      <SelectedPersonActions meetupId={meetup.id} person={person} busy={busy} run={run} setPerson={setPerson} setNotice={setNotice} />
      <strong className="meetup-people">{people(meetup.people)}</strong>
      <EquipmentSummary meetup={meetup} activityType={activityType} user={user} />
      <EquipmentChange meetup={meetup} activityType={activityType} user={user} busy={busy} run={run} />
      <MeetupAnswers
        meetup={meetup}
        offered={offered}
        joining={joining?.id === meetup.id}
        busy={busy}
        onAnswer={(choice) => run((token) => answerMove(token, meetup.id, choice))}
        onJoin={() => user ? setJoining({ id: meetup.id, partySize: 1, equipment: [] }) : onLoginNeeded()}
        onLeave={() => run((token) => leaveMeetup(token, meetup.id))}
      />
      <InviteContacts meetup={meetup} />
      <SelectedJoinForm meetup={meetup} activityType={activityType} joining={joining} busy={busy} setJoining={setJoining} run={run} />
      <SeriesControls meetup={meetup} laterCount={laterCount} expanded={expanded} cancellableSeriesId={cancellableSeriesId} busy={busy} onToggleExpanded={onToggleExpanded} run={run} />
      <LifecycleControls meetup={meetup} moving={moving} busy={busy} now={now} setMoving={setMoving} run={run} />
    </li>
  )
}
