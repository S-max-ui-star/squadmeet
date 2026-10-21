import { useState, type Dispatch, type SetStateAction } from 'react'
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
type SubmitInput = {
  kind: Props['kind']
  placeId: number
  run: Run
  series: boolean
  slotFields: SlotFields[]
  partySize: number
  until: string
  hours: number
  startsAt: string
}

const HOURS = [1, 2, 3, 4]
const time = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

function nextFullHour(now: Date): Date {
  const next = new Date(now)
  next.setHours(next.getHours() + 1, 0, 0, 0)
  return next
}

function RepeatToggle({ later, repeat, setRepeat }: { later: boolean; repeat: boolean; setRepeat: Dispatch<SetStateAction<boolean>> }) {
  if (!later) return null
  return <label className="checkbox"><input type="checkbox" checked={repeat} onChange={(event) => setRepeat(event.target.checked)} /> 🔁 Jede Woche wiederholen</label>
}

function SeriesFields({ enabled, fields, until, berlinDate, setFields, setUntil }: {
  enabled: boolean
  fields: SlotFields[]
  until: string
  berlinDate: string
  setFields: Dispatch<SetStateAction<SlotFields[]>>
  setUntil: Dispatch<SetStateAction<string>>
}) {
  if (!enabled) return null
  return (
    <fieldset className="series-slots">
      <legend>An welchen Tagen?</legend>
      {WEEKDAYS.map((name, weekday) => {
        const field = fields[weekday]
        const change = (patch: Partial<SlotFields>) => setFields((old) => old.map((value, index) => index === weekday ? { ...value, ...patch } : value))
        return (
          <div key={name} className="series-slot">
            <label><input type="checkbox" checked={field.on} onChange={(event) => change({ on: event.target.checked })} /> {name}</label>
            {field.on && <><input type="time" aria-label={`Beginn ${name}`} required value={field.time} onChange={(event) => change({ time: event.target.value })} /><select aria-label={`Dauer ${name}`} value={field.hours} onChange={(event) => change({ hours: Number(event.target.value) })}>{HOURS.map((value) => <option key={value} value={value}>{value} h</option>)}</select></>}
          </div>
        )
      })}
      <label className="field">Bis (optional)<input type="date" value={until} min={berlinDate} onChange={(event) => setUntil(event.target.value)} /></label>
      <p className="hint">Zeiten gelten in der Zeitzone Europe/Berlin.</p>
    </fieldset>
  )
}

function SingleStartField({ enabled, startsAt, setStartsAt, bounds }: {
  enabled: boolean
  startsAt: string
  setStartsAt: Dispatch<SetStateAction<string>>
  bounds: { min: string; max: string }
}) {
  if (!enabled) return null
  return <label className="field">Wann?<input type="datetime-local" required value={startsAt} min={bounds.min} max={bounds.max} onChange={(event) => setStartsAt(event.target.value)} /></label>
}

function DurationChoice({ enabled, hours, setHours }: { enabled: boolean; hours: number; setHours: Dispatch<SetStateAction<number>> }) {
  if (!enabled) return null
  return <fieldset className="segments"><legend>Wie lange bist du da?</legend>{HOURS.map((value) => <button key={value} type="button" aria-pressed={value === hours} className={value === hours ? 'on' : ''} onClick={() => setHours(value)}>{value} h</button>)}</fieldset>
}

function FormHint({ kind, series, openedAt, hours }: { kind: 'now' | 'later'; series: boolean; openedAt: Date; hours: number }) {
  if (series) return <p className="hint">Jede Woche, die nächsten 30 Tage sind schon geplant. Andere treten jedem Termin einzeln bei.</p>
  if (kind === 'later') return <p className="hint">Alle sehen dein Treffen hier am Platz. Zur Startzeit erscheint es auf der Karte.</p>
  return <p className="hint">Alle sehen dich auf der Karte bis {time.format(openedAt.getTime() + hours * 3_600_000)} Uhr.</p>
}

function ValidationMessages({ noWeekday, emptySeries }: { noWeekday: boolean; emptySeries: boolean }) {
  return <>{noWeekday && <p className="hint">Wähle mindestens einen Wochentag.</p>}{emptySeries && <p className="form-error">Die Auswahl enthält keinen zukünftigen Termin.</p>}</>
}

const submitLabel = (kind: 'now' | 'later', series: boolean) => series ? '🔁 Serie anlegen' : kind === 'later' ? '🗓 Treffen planen' : '📍 Jetzt auf die Karte'

function seriesState(kind: Props['kind'], repeat: boolean, fields: SlotFields[], until: string, openedAt: Date) {
  const series = kind === 'later' && repeat
  const noWeekday = series && fields.every((field) => !field.on)
  const berlinDate = berlinDateValue(openedAt)
  const hasOccurrence = !series || hasSeriesOccurrence(fields, until, berlinDate, berlinTimeValue(openedAt))
  return { series, noWeekday, berlinDate, emptySeries: series && !noWeekday && !hasOccurrence }
}

function submitCreation({ kind, placeId, run, series, slotFields, partySize, until, hours, startsAt }: SubmitInput) {
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

export default function MeetupCreateForm({ kind, placeId, busy, run, onClose }: Props) {
  const [openedAt] = useState(() => new Date())
  const [startsAt, setStartsAt] = useState(() => toInputValue(nextFullHour(new Date())))
  const [repeat, setRepeat] = useState(false)
  const [slotFields, setSlotFields] = useState<SlotFields[]>(emptySlots)
  const [until, setUntil] = useState('')
  const [hours, setHours] = useState(2)
  const [partySize, setPartySize] = useState(1)

  const bounds = inputBounds(openedAt)
  const { series, noWeekday, berlinDate, emptySeries } = seriesState(kind, repeat, slotFields, until, openedAt)
  const submit = () => submitCreation({ kind, placeId, run, series, slotFields, partySize, until, hours, startsAt })

  return (
    <form className="now-form" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <h3>{kind === 'later' ? 'Später treffen' : 'Ich bin jetzt hier'}</h3>
      <RepeatToggle later={kind === 'later'} repeat={repeat} setRepeat={setRepeat} />
      <SeriesFields enabled={series} fields={slotFields} until={until} berlinDate={berlinDate} setFields={setSlotFields} setUntil={setUntil} />
      <SingleStartField enabled={kind === 'later' && !series} startsAt={startsAt} setStartsAt={setStartsAt} bounds={bounds} />
      <DurationChoice enabled={!series} hours={hours} setHours={setHours} />
      <PartySizeStepper value={partySize} onChange={setPartySize} />
      <FormHint kind={kind} series={series} openedAt={openedAt} hours={hours} />
      <ValidationMessages noWeekday={noWeekday} emptySeries={emptySeries} />
      <button type="submit" className="now-button" disabled={busy || noWeekday || emptySeries}>
        {submitLabel(kind, series)}
      </button>
      <button type="button" className="link-button" onClick={onClose}>Abbrechen</button>
    </form>
  )
}
