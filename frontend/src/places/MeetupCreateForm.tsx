import { useState } from 'react'
import { createMeetup, createSeries } from '../api/meetups'
import PartySizeStepper from './PartySizeStepper'
import {
  berlinDateValue,
  berlinTimeValue,
  fromInputValue,
  inputBounds,
  toInputValue,
} from './meetupTime'
import { WEEKDAYS, emptySlots, hasSeriesOccurrence, slotsInput, type SlotFields } from './seriesGroups'

type Run = (action: (token: string) => Promise<unknown>) => Promise<boolean>
type Props = { kind: 'now' | 'later'; placeId: number; busy: boolean; run: Run; onClose: () => void }

const HOURS = [1, 2, 3, 4]
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

function nextFullHour(now: Date): Date {
  const next = new Date(now)
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next
}

export default function MeetupCreateForm({ kind, placeId, busy, run, onClose }: Props) {
  const [openedAt] = useState(() => new Date())
  const [startsAt, setStartsAt] = useState(() => toInputValue(nextFullHour(new Date())))
  const [repeat, setRepeat] = useState(false)
  const [slotFields, setSlotFields] = useState<SlotFields[]>(emptySlots)
  const [until, setUntil] = useState('')
  const [hours, setHours] = useState(2)
  const [partySize, setPartySize] = useState(1)

  const bounds = inputBounds(openedAt)
  const series = kind === 'later' && repeat
  const noWeekday = series && slotFields.every((field) => !field.on)
  const berlinDate = berlinDateValue(openedAt)
  const hasOccurrence = !series || hasSeriesOccurrence(slotFields, until, berlinDate, berlinTimeValue(openedAt))
  const emptySeries = series && !noWeekday && !hasOccurrence

  const submit = () => {
    if (series) {
      return run((token) => createSeries(token, {
        place_id: placeId,
        slots: slotsInput(slotFields),
        party_size: partySize,
        until: until || null,
      }))
    }
    const input = { place_id: placeId, hours, party_size: partySize }
    return run((token) => createMeetup(token, kind === 'later' ? { ...input, starts_at: fromInputValue(startsAt) } : input))
  }

  return (
    <form className="now-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <h3>{kind === 'later' ? 'Später treffen' : 'Ich bin jetzt hier'}</h3>
      {kind === 'later' && (
        <label className="checkbox">
          <input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /> 🔁 Jede Woche wiederholen
        </label>
      )}
      {series && (
        <fieldset className="series-slots">
          <legend>An welchen Tagen?</legend>
          {WEEKDAYS.map((name, weekday) => {
            const field = slotFields[weekday]
            const change = (patch: Partial<SlotFields>) => setSlotFields((old) => old.map((value, index) => index === weekday ? { ...value, ...patch } : value))
            return (
              <div key={name} className="series-slot">
                <label><input type="checkbox" checked={field.on} onChange={(event) => change({ on: event.target.checked })} /> {name}</label>
                {field.on && (
                  <>
                    <input type="time" aria-label={`Beginn ${name}`} required value={field.time} onChange={(event) => change({ time: event.target.value })} />
                    <select aria-label={`Dauer ${name}`} value={field.hours} onChange={(event) => change({ hours: Number(event.target.value) })}>
                      {HOURS.map((value) => <option key={value} value={value}>{value} h</option>)}
                    </select>
                  </>
                )}
              </div>
            )
          })}
          <label className="field">
            Bis (optional)
            <input type="date" value={until} min={berlinDate} onChange={(event) => setUntil(event.target.value)} />
          </label>
          <p className="hint">Zeiten gelten in der Zeitzone Europe/Berlin.</p>
        </fieldset>
      )}
      {kind === 'later' && !series && (
        <label className="field">
          Wann?
          <input type="datetime-local" required value={startsAt} min={bounds.min} max={bounds.max} onChange={(event) => setStartsAt(event.target.value)} />
        </label>
      )}
      {!series && (
        <fieldset className="segments">
          <legend>Wie lange bist du da?</legend>
          {HOURS.map((value) => (
            <button key={value} type="button" aria-pressed={value === hours} className={value === hours ? 'on' : ''} onClick={() => setHours(value)}>{value} h</button>
          ))}
        </fieldset>
      )}
      <PartySizeStepper value={partySize} onChange={setPartySize} />
      {series ? (
        <p className="hint">Jede Woche, die nächsten 30 Tage sind schon geplant. Andere treten jedem Termin einzeln bei.</p>
      ) : kind === 'later' ? (
        <p className="hint">Alle sehen dein Treffen hier am Platz. Zur Startzeit erscheint es auf der Karte.</p>
      ) : (
        <p className="hint">Alle sehen dich auf der Karte bis {time.format(openedAt.getTime() + hours * 3_600_000)} Uhr.</p>
      )}
      {noWeekday && <p className="hint">Wähle mindestens einen Wochentag.</p>}
      {emptySeries && <p className="form-error">Die Auswahl enthält keinen zukünftigen Termin.</p>}
      <button type="submit" className="now-button" disabled={busy || noWeekday || emptySeries}>
        {series ? '🔁 Serie anlegen' : kind === 'later' ? '🗓 Treffen planen' : '📍 Jetzt auf die Karte'}
      </button>
      <button type="button" className="link-button" onClick={onClose}>Abbrechen</button>
    </form>
  )
}
