import { Fragment, useCallback, useEffect, useState } from 'react'
import type { User } from '../api/auth'
import { loadToken } from '../api/auth'
import {
  answerMove,
  cancelSeries,
  createSeries,
  cancelMeetup,
  createMeetup,
  endMeetup,
  fetchMeetups,
  joinMeetup,
  leaveMeetup,
  moveMeetupStart,
  type Meetup,
  type MeetupAction,
} from '../api/meetups'
import { onMeetupChange } from '../api/live'
import { askForContact, blockUser } from '../api/contacts'
import { AVATARS } from '../auth/avatars'
import InviteContacts from './InviteContacts'
import { fromInputValue, inputBounds, slot, startChoice, toInputValue } from './meetupTime'
import { WEEKDAYS, emptySlots, groupSeries, slotsInput, type SlotFields } from './seriesGroups'

type Props = {
  placeId: number
  user: User | null
  onLoginNeeded: () => void
  // Called after a Meetup was created, moved or ended, so the map can show the new state.
  onChanged: () => void
}

const HOURS = [1, 2, 3, 4]
const MAX_PARTY_SIZE = 10
// A Meetup that ends while the panel is open leaves the list within this time.
const REFRESH_MS = 60_000

const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

function people(n: number): string {
  return n === 1 ? '1 Person' : `${n} Personen`
}

// The next full hour, the default start of a later Meetup.
function nextFullHour(now: Date): Date {
  const next = new Date(now)
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next
}

// A Nickname in a Meetup; a tap offers "Als Kontakt anfragen" and "Blockieren" (SCRUM-32).
function PersonButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="person-button" onClick={onClick}>
      {label}
    </button>
  )
}

// The Party size, the user included (1–10), for a new Meetup and for a Join.
function PartySizeStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="stepper" role="group" aria-label="Personenzahl (mit dir)">
      <span>Personenzahl (mit dir)</span>
      <button type="button" aria-label="Eine Person weniger" disabled={value <= 1} onClick={() => onChange(value - 1)}>
        −
      </button>
      <output>{value}</output>
      <button
        type="button"
        aria-label="Eine Person mehr"
        disabled={value >= MAX_PARTY_SIZE}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  )
}

// A Push tap carries the exact Meetup as a fragment. The list loads asynchronously, so scroll
// only after that card exists (SCRUM-44). Keeping this effect outside PlaceMeetups also keeps the
// already large Meetup workflow from gaining another branch.
function MeetupDeepLink({ meetups }: { meetups: Meetup[] }) {
  useEffect(() => {
    const match = /^#treffen-(\d+)$/.exec(window.location.hash)
    if (!match || !meetups.some((meetup) => meetup.id === Number(match[1]))) return
    requestAnimationFrame(() => document.getElementById(`treffen-${match[1]}`)?.scrollIntoView({ block: 'center' }))
  }, [meetups])
  return null
}

// The Meetups part of the Place detail, as in the prototype (SCRUM-17): the active and later
// Meetups, the "Ich bin jetzt hier" form (SCRUM-29), "Später treffen" (SCRUM-35), and
// Loads now, every REFRESH_MS, and again on each live event for this Place (SCRUM-93).
function useReloads(reload: () => void, placeId: number) {
  useEffect(() => {
    reload()
    const timer = setInterval(reload, REFRESH_MS)
    const stop = onMeetupChange((changed) => {
      if (changed === placeId) reload()
    })
    return () => {
      clearInterval(timer)
      stop()
    }
  }, [reload, placeId])
}

// "Ich komme mit" / "Verlassen" (SCRUM-34). Guests see only the number of people.
// The Host can cancel before the start, Leave (handover), and move a Meetup with Joins; the
// users who were in then choose go along / stay / leave (SCRUM-37).
export default function PlaceMeetups({ placeId, user, onLoginNeeded, onChanged }: Props) {
  const [meetups, setMeetups] = useState<Meetup[]>([])
  const [error, setError] = useState<string | null>(null)
  // Which form is open: "Ich bin jetzt hier", "Später treffen", or none.
  const [creating, setCreating] = useState<'now' | 'later' | null>(null)
  // The start of a later Meetup, as the value of the date and time field.
  const [startsAt, setStartsAt] = useState('')
  // The Meetup whose start the Host is moving, and its new start.
  const [moving, setMoving] = useState<{ id: number; startsAt: string } | null>(null)
  // The Meetup the user is joining, and their Party size.
  const [joining, setJoining] = useState<{ id: number; partySize: number } | null>(null)
  // The person whose Nickname was tapped: ask them as a Contact or Block them (SCRUM-32).
  const [person, setPerson] = useState<{ meetupId: number; nickname: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Weekly Series (SCRUM-38): "Jede Woche wiederholen" in the form, and the open overviews.
  const [repeat, setRepeat] = useState(false)
  const [slotFields, setSlotFields] = useState<SlotFields[]>(emptySlots)
  const [until, setUntil] = useState('')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  // The time of the last load, for the limits of the date and time fields.
  const [now, setNow] = useState(() => new Date())
  const [hours, setHours] = useState(2)
  const [partySize, setPartySize] = useState(1)
  const [busy, setBusy] = useState(false)
  // When the form was opened; the shown end time is counted from here.
  const [openedAt, setOpenedAt] = useState(0)

  // A guest sends no token and gets no Nicknames; after a login or logout this loads again.
  const reload = useCallback(() => {
    fetchMeetups(placeId, user ? loadToken() : null)
      .then((found) => {
        setMeetups(found)
        setNow(new Date())
        setError(null)
      })
      .catch((err: Error) => setError(err.message))
  }, [placeId, user])

  useReloads(reload, placeId)

  // True when the action worked, so a caller can show its own message.
  async function run(action: (token: string) => Promise<unknown>): Promise<boolean> {
    const token = loadToken()
    if (!token) {
      onLoginNeeded()
      return false
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action(token)
      setCreating(null)
      setMoving(null)
      setJoining(null)
      setPerson(null)
      reload()
      onChanged()
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }

  function startCreating(kind: 'now' | 'later') {
    if (!user) {
      onLoginNeeded()
      return
    }
    setHours(2)
    setPartySize(1)
    setOpenedAt(Date.now())
    setStartsAt(toInputValue(nextFullHour(new Date())))
    setRepeat(false)
    setSlotFields(emptySlots())
    setUntil('')
    setCreating(kind)
  }

  const bounds = inputBounds(new Date(openedAt))
  // The form makes a weekly Series; at least one weekday must be on.
  const series = creating === 'later' && repeat
  const noWeekday = series && slotFields.every((f) => !f.on)

  // One Meetup in the list. `laterCount` > 0: the next Occurrence of a Series, with the
  // overview of its other dates (SCRUM-38).
  function renderCard(meetup: Meetup, laterCount: number) {
    // The server says what the Meetup is and what this user may do (SCRUM-61).
    const can = (action: MeetupAction) => meetup.actions.includes(action)
    const live = meetup.state === 'live'
    // Only for the label "(du, Gastgeber)", not for a rule.
    const isHost = user !== null && user.id === meetup.host?.id
    const offer = meetup.move_offer
    return (
      <li id={`treffen-${meetup.id}`} key={meetup.id} className={live ? 'meetup-card' : meetup.state === 'cancelled' ? 'meetup-card cancelled' : 'meetup-card later'}>
        <div>
          {meetup.state === 'cancelled' && (
            <>
              <span className="cancelled-tag">Abgesagt</span>{' '}
            </>
          )}
          {meetup.series_id !== null && (
            <>
              <span className="series-tag" title="Termin einer wöchentlichen Serie">
                🔁
              </span>{' '}
            </>
          )}
          {live ? (
            <>
              <span className="live">LIVE</span> bis {time.format(new Date(meetup.ends_at))} Uhr
            </>
          ) : (
            slot(meetup)
          )}
          {meetup.host && (
            <>
              <br />
              {isHost ? (
                `${AVATARS[meetup.host.avatar]?.emoji ?? ''} ${meetup.host.nickname} (du, Gastgeber)`
              ) : (
                <PersonButton
                  label={`${AVATARS[meetup.host.avatar]?.emoji ?? ''} ${meetup.host.nickname}`}
                  onClick={() => setPerson({ meetupId: meetup.id, nickname: meetup.host!.nickname })}
                />
              )}
            </>
          )}
          {meetup.participants && meetup.participants.length > 0 && (
            <>
              <br />
              <span className="participants">
                Dabei:{' '}
                {meetup.participants.map((p, i) => {
                  const label = `${AVATARS[p.avatar]?.emoji ?? ''} ${p.nickname}${p.party_size > 1 ? ` (${p.party_size})` : ''}`
                  return (
                    <span key={p.id}>
                      {i > 0 && ', '}
                      {p.id === user?.id ? (
                        label
                      ) : (
                        <PersonButton
                          label={label}
                          onClick={() => setPerson({ meetupId: meetup.id, nickname: p.nickname })}
                        />
                      )}
                    </span>
                  )
                })}
              </span>
            </>
          )}
          {meetup.blocked_user_in && (
            <>
              <br />
              <span className="blocked-warning">⚠️ Jemand, den du blockiert hast, ist dabei</span>
            </>
          )}
        </div>
        {person?.meetupId === meetup.id && (
          <div className="person-actions" role="group" aria-label={person.nickname}>
            <strong>{person.nickname}</strong>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run((token) => askForContact(token, person.nickname)).then(
                  (ok) => ok && setNotice(`Kontaktanfrage an ${person.nickname} gesendet`),
                )
              }
            >
              Als Kontakt anfragen
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run((token) => blockUser(token, person.nickname)).then(
                  (ok) => ok && setNotice(`${person.nickname} ist blockiert`),
                )
              }
            >
              Blockieren
            </button>
            <button type="button" className="link-button" onClick={() => setPerson(null)}>
              Abbrechen
            </button>
          </div>
        )}
        <strong className="meetup-people">{people(meetup.people)}</strong>
        {offer && (
          <div className="move-offer" role="group" aria-label="Neue Zeit">
            <p>
              {AVATARS[offer.host.avatar]?.emoji} {offer.host.nickname} hat das Treffen auf{' '}
              {startChoice(offer.starts_at, meetup.starts_at)} verlegt. Wann bist du dabei?
            </p>
            {/* The times are the answers (SCRUM-79): new time = go along, old time = stay. */}
            {(
              [
                ['go', startChoice(offer.starts_at, meetup.starts_at)],
                ['stay', startChoice(meetup.starts_at, offer.starts_at)],
                ['leave', 'Gar nicht'],
              ] as const
            ).map(([choice, label]) => (
              <button
                key={choice}
                type="button"
                disabled={busy}
                onClick={() => run((token) => answerMove(token, meetup.id, choice))}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {can('join') && joining?.id !== meetup.id && (
          <button
            type="button"
            disabled={busy}
            onClick={() => (user ? setJoining({ id: meetup.id, partySize: 1 }) : onLoginNeeded())}
          >
            Ich komme mit
          </button>
        )}
        {can('leave') && (
          <button type="button" disabled={busy} onClick={() => run((token) => leaveMeetup(token, meetup.id))}>
            Verlassen
          </button>
        )}
        <InviteContacts meetup={meetup} />
        {joining?.id === meetup.id && (
          <form
            className="move-form"
            onSubmit={(event) => {
              event.preventDefault()
              run((token) => joinMeetup(token, meetup.id, joining.partySize))
            }}
          >
            <PartySizeStepper
              value={joining.partySize}
              onChange={(n) => setJoining({ id: meetup.id, partySize: n })}
            />
            <button type="submit" disabled={busy}>
              Beitreten
            </button>
            <button type="button" className="link-button" onClick={() => setJoining(null)}>
              Abbrechen
            </button>
          </form>
        )}
        {laterCount > 0 && meetup.series_id !== null && (
          <button
            type="button"
            className="link-button"
            aria-expanded={expanded.has(meetup.series_id)}
            onClick={() => {
              const next = new Set(expanded)
              if (next.has(meetup.series_id!)) next.delete(meetup.series_id!)
              else next.add(meetup.series_id!)
              setExpanded(next)
            }}
          >
            Alle Termine ({laterCount + 1}) {expanded.has(meetup.series_id) ? '▴' : '▾'}
          </button>
        )}
        {can('cancel_series') && laterCount > 0 && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run((token) => cancelSeries(token, meetup.series_id!))}
          >
            Serie absagen
          </button>
        )}
        {can('end') && (
          <button type="button" disabled={busy} onClick={() => run((token) => endMeetup(token, meetup.id))}>
            Jetzt beenden
          </button>
        )}
        {can('cancel') && (
          <button type="button" disabled={busy} onClick={() => run((token) => cancelMeetup(token, meetup.id))}>
            Absagen
          </button>
        )}
        {can('move') && moving?.id !== meetup.id && (
          <button
            type="button"
            disabled={busy}
            onClick={() => setMoving({ id: meetup.id, startsAt: toInputValue(new Date(meetup.starts_at)) })}
          >
            Zeit ändern
          </button>
        )}
        {moving?.id === meetup.id && (
          <form
            className="move-form"
            onSubmit={(event) => {
              event.preventDefault()
              run((token) => moveMeetupStart(token, meetup.id, fromInputValue(moving.startsAt)))
            }}
          >
            {(meetup.participants?.length ?? 0) > 0 && (
              <p className="hint">
                Die anderen werden gefragt, ob sie zur neuen oder zur alten Zeit dabei sind.
              </p>
            )}
            <label className="field">
              Neuer Beginn
              <input
                type="datetime-local"
                required
                value={moving.startsAt}
                min={inputBounds(now).min}
                max={inputBounds(now).max}
                onChange={(event) => setMoving({ id: meetup.id, startsAt: event.target.value })}
              />
            </label>
            <button type="submit" disabled={busy}>
              Speichern
            </button>
            <button type="button" className="link-button" onClick={() => setMoving(null)}>
              Abbrechen
            </button>
          </form>
        )}
      </li>
    )
  }

  return (
    <div className="place-meetups">
      <MeetupDeepLink meetups={meetups} />
      {creating ? (
        <form
          className="now-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (series) {
              run((token) =>
                createSeries(token, {
                  place_id: placeId,
                  slots: slotsInput(slotFields),
                  party_size: partySize,
                  until: until || null,
                }),
              )
              return
            }
            const input = { place_id: placeId, hours, party_size: partySize }
            run((token) =>
              createMeetup(token, creating === 'later' ? { ...input, starts_at: fromInputValue(startsAt) } : input),
            )
          }}
        >
          <h3>{creating === 'later' ? 'Später treffen' : 'Ich bin jetzt hier'}</h3>
          {creating === 'later' && (
            <label className="checkbox">
              <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /> 🔁
              Jede Woche wiederholen
            </label>
          )}
          {series && (
            <fieldset className="series-slots">
              <legend>An welchen Tagen?</legend>
              {WEEKDAYS.map((name, weekday) => {
                const f = slotFields[weekday]
                const change = (patch: Partial<SlotFields>) =>
                  setSlotFields(slotFields.map((old, i) => (i === weekday ? { ...old, ...patch } : old)))
                return (
                  <div key={name} className="series-slot">
                    <label>
                      <input type="checkbox" checked={f.on} onChange={(event) => change({ on: event.target.checked })} />{' '}
                      {name}
                    </label>
                    {f.on && (
                      <>
                        <input
                          type="time"
                          aria-label={`Beginn ${name}`}
                          required
                          value={f.time}
                          onChange={(event) => change({ time: event.target.value })}
                        />
                        <select
                          aria-label={`Dauer ${name}`}
                          value={f.hours}
                          onChange={(event) => change({ hours: Number(event.target.value) })}
                        >
                          {HOURS.map((h) => (
                            <option key={h} value={h}>
                              {h} h
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                )
              })}
              <label className="field">
                Bis (optional)
                <input type="date" value={until} min={bounds.min.slice(0, 10)} onChange={(event) => setUntil(event.target.value)} />
              </label>
            </fieldset>
          )}
          {creating === 'later' && !series && (
            <label className="field">
              Wann?
              <input
                type="datetime-local"
                required
                value={startsAt}
                min={bounds.min}
                max={bounds.max}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </label>
          )}
          {!series && (
            <fieldset className="segments">
              <legend>Wie lange bist du da?</legend>
              {HOURS.map((h) => (
                <button
                  key={h}
                  type="button"
                  aria-pressed={h === hours}
                  className={h === hours ? 'on' : ''}
                  onClick={() => setHours(h)}
                >
                  {h} h
                </button>
              ))}
            </fieldset>
          )}
          <PartySizeStepper value={partySize} onChange={setPartySize} />
          {series ? (
            <p className="hint">Jede Woche, die nächsten 30 Tage sind schon geplant. Andere treten jedem Termin einzeln bei.</p>
          ) : creating === 'later' ? (
            <p className="hint">Alle sehen dein Treffen hier am Platz. Zur Startzeit erscheint es auf der Karte.</p>
          ) : (
            <p className="hint">Alle sehen dich auf der Karte bis {time.format(openedAt + hours * 3_600_000)} Uhr.</p>
          )}
          {noWeekday && <p className="hint">Wähle mindestens einen Wochentag.</p>}
          <button type="submit" className="now-button" disabled={busy || noWeekday}>
            {series ? '🔁 Serie anlegen' : creating === 'later' ? '🗓 Treffen planen' : '📍 Jetzt auf die Karte'}
          </button>
          <button type="button" className="link-button" onClick={() => setCreating(null)}>
            Abbrechen
          </button>
        </form>
      ) : (
        <>
          <button type="button" className="now-button" onClick={() => startCreating('now')}>
            📍 Ich bin jetzt hier
          </button>
          <button type="button" className="later-button" onClick={() => startCreating('later')}>
            🗓 Später treffen
          </button>
        </>
      )}

      {error && <p className="form-error">{error}</p>}
      {notice && !error && <p className="hint">{notice}</p>}

      <h3>Treffen hier</h3>
      {meetups.length === 0 && <p className="hint">Gerade ist niemand hier.</p>}
      <ul className="meetup-list">
        {groupSeries(meetups).map(({ meetup, laterOfSeries }) => (
          <Fragment key={meetup.id}>
            {renderCard(meetup, laterOfSeries.length)}
            {expanded.has(meetup.series_id ?? -1) && laterOfSeries.map((later) => renderCard(later, 0))}
          </Fragment>
        ))}
      </ul>
    </div>
  )
}
