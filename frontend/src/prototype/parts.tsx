// PROTOTYPE (SCRUM-17): the parts of the bottom sheet. No polish beyond what the team must judge.
import { useState, type Dispatch } from 'react'
import {
  ACTIVITIES,
  HOUR,
  avatarOf,
  earliestJoin,
  USERS,
  formatWhen,
  partyTotal,
  people,
  placeById,
  timeFormat,
  userById,
  type Action,
  type Meetup,
  type State,
} from './data'

// Party size 1–10 with big − / + buttons instead of a small select.
function PartySize({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="pt-field">
      <span className="pt-label">Personenzahl (mit dir)</span>
      <div className="pt-stepper">
        <button type="button" onClick={() => onChange(Math.max(1, value - 1))} disabled={value <= 1} aria-label="Eine Person weniger">
          −
        </button>
        <output>{value}</output>
        <button type="button" onClick={() => onChange(Math.min(10, value + 1))} disabled={value >= 10} aria-label="Eine Person mehr">
          +
        </button>
      </div>
    </div>
  )
}

export function MeetupCard({ meetup, me, onOpen }: { meetup: Meetup; me: string; onOpen: () => void }) {
  const host = userById(meetup.hostId)
  const joined = meetup.joins.some((j) => j.userId === me)
  return (
    <button type="button" className={`pt-card${meetup.cancelled ? ' cancelled' : ''}`} onClick={onOpen}>
      <span className="pt-card-main">
        <span className="pt-card-when">
          {!meetup.cancelled && <span className="pt-live">LIVE</span>}
          {formatWhen(meetup)}
        </span>
        <span className="pt-card-sub">
          {avatarOf(host.id)} {host.nickname}
          {meetup.cancelled && ' · Abgesagt'}
          {joined && !meetup.cancelled && ' · du bist dabei'}
        </span>
      </span>
      <span className="pt-count" aria-label={people(partyTotal(meetup))}>
        {partyTotal(meetup)}
        <small>Pers.</small>
      </span>
    </button>
  )
}

export function MeetupDetail({
  meetup,
  state,
  dispatch,
  showMessage,
}: {
  meetup: Meetup
  state: State
  dispatch: Dispatch<Action>
  showMessage: (text: string) => void
}) {
  const [partySize, setPartySize] = useState(1)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const place = placeById(meetup.placeId)
  const isHost = meetup.hostId === state.me
  const myJoin = meetup.joins.find((j) => j.userId === state.me)
  // The Host can Leave only when others have joined (CONTEXT.md); the earliest of them becomes Host.
  const nextHost = earliestJoin(meetup.joins.filter((j) => j.userId !== state.me))

  function dispatchWithMessage(action: Action, text: string) {
    dispatch(action)
    showMessage(text)
  }

  return (
    <div className="pt-detail">
      <div className={`pt-status${meetup.cancelled ? ' cancelled' : ''}`}>{meetup.cancelled ? 'Abgesagt' : '● Ich bin jetzt hier'}</div>
      <h2 className="pt-when">{formatWhen(meetup)}</h2>
      <p className="pt-muted">
        {ACTIVITIES[place.activity].emoji} {place.name}
      </p>

      <h3 className="pt-h3">
        Wer kommt <span className="pt-total">{people(partyTotal(meetup))}</span>
      </h3>
      <ul className="pt-people">
        {meetup.joins.map((j) => {
          const user = userById(j.userId)
          return (
            <li key={j.userId}>
              <span className="pt-avatar">{avatarOf(user.id)}</span>
              <span className="pt-name">
                {user.nickname}
                {j.userId === state.me && ' (du)'}
              </span>
              {j.partySize > 1 && <span className="pt-plus">+{j.partySize - 1}</span>}
              {j.userId === meetup.hostId && <span className="pt-host">Gastgeber</span>}
            </li>
          )
        })}
      </ul>

      {!meetup.cancelled && (
        <div className="pt-actions">
          {!myJoin && (
            <>
              <PartySize value={partySize} onChange={setPartySize} />
              <button
                type="button"
                className="pt-btn primary"
                onClick={() => dispatchWithMessage({ type: 'join', meetupId: meetup.id, partySize }, 'Du kommst mit. Der Gastgeber sieht dich in der Liste.')}
              >
                Ich komme mit
              </button>
            </>
          )}
          {myJoin && !isHost && <p className="pt-joined">✓ Du bist dabei</p>}
          {myJoin && (!isHost || nextHost) && (
            <button
              type="button"
              className="pt-btn"
              onClick={() =>
                dispatchWithMessage(
                  { type: 'leave', meetupId: meetup.id },
                  isHost ? `Du bist raus. ${userById(nextHost!.userId).nickname} ist jetzt Gastgeber.` : 'Du bist raus.',
                )
              }
            >
              Verlassen
              {isHost && <small>{userById(nextHost!.userId).nickname} wird Gastgeber</small>}
            </button>
          )}
          {isHost &&
            (confirmCancel ? (
              <div className="pt-confirm">
                <p>Für alle absagen? Alle Mitkommenden sehen es als abgesagt.</p>
                <button type="button" className="pt-btn danger" onClick={() => dispatchWithMessage({ type: 'cancel', meetupId: meetup.id }, 'Treffen abgesagt.')}>
                  Ja, absagen
                </button>
                <button type="button" className="pt-btn" onClick={() => setConfirmCancel(false)}>
                  Nein
                </button>
              </div>
            ) : (
              <button type="button" className="pt-btn danger-outline" onClick={() => setConfirmCancel(true)}>
                Absagen
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

export function NowForm({ onSubmit }: { onSubmit: (hours: number, partySize: number) => void }) {
  const [hours, setHours] = useState(2)
  const [partySize, setPartySize] = useState(1)
  const [openedAt] = useState(Date.now)
  return (
    <div className="pt-form">
      <h2 className="pt-when">Ich bin jetzt hier</h2>
      <div className="pt-field">
        <span className="pt-label">Wie lange bist du da?</span>
        <div className="pt-segments">
          {[1, 2, 3, 4].map((h) => (
            <button key={h} type="button" className={h === hours ? 'selected' : ''} onClick={() => setHours(h)}>
              {h} h
            </button>
          ))}
        </div>
      </div>
      <PartySize value={partySize} onChange={setPartySize} />
      <p className="pt-muted">Alle sehen dich auf der Karte bis {timeFormat.format(openedAt + hours * HOUR)} Uhr.</p>
      <button type="button" className="pt-btn now" onClick={() => onSubmit(hours, partySize)}>
        📍 Jetzt auf die Karte
      </button>
    </div>
  )
}

// Shows the timestamps in the state dump as readable dates.
function showTimes(key: string, value: unknown) {
  return ['start', 'end', 'joinedAt'].includes(key) && typeof value === 'number'
    ? new Date(value).toLocaleString('de-DE')
    : value
}

// Only for the prototype: switch the person (to see the Host and the guest view) and see the state.
export function PrototypeBar({ state, dispatch }: { state: State; dispatch: Dispatch<Action> }) {
  return (
    <details className="pt-proto">
      <summary>
        PROTOTYP · {avatarOf(state.me)} {userById(state.me).nickname}
      </summary>
      <div className="pt-proto-body">
        <span>Ich bin:</span>
        {USERS.map((u) => (
          <button key={u.id} type="button" className={u.id === state.me ? 'selected' : ''} onClick={() => dispatch({ type: 'setMe', userId: u.id })}>
            {avatarOf(u.id)} {u.nickname}
          </button>
        ))}
        <details>
          <summary>Daten</summary>
          <pre>{JSON.stringify(state.meetups, showTimes, 2)}</pre>
        </details>
      </div>
    </details>
  )
}
