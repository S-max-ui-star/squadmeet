// Times of Meetups (SCRUM-29, SCRUM-35) in the browser's own time zone. The server gets every
// time with its time zone, so it knows the exact moment.

// A copy of the server's limit for a later Meetup (MAX_DAYS_AHEAD in
// backend/app/meetup_lifecycle.py), only for the date picker; the server always checks.
export const MAX_DAYS_AHEAD = 30
const BERLIN = 'Europe/Berlin'

type Span = { starts_at: string; ends_at: string }

const day = new Intl.DateTimeFormat('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' })
const clock = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' })

// "Sa. 17.10., 18:00–20:00 Uhr"
export function slot(meetup: Span): string {
  const start = new Date(meetup.starts_at)
  return `${day.format(start).replace(',', '')}, ${clock.format(start)}–${clock.format(new Date(meetup.ends_at))} Uhr`
}

// A start on a move answer button (SCRUM-79): "18:00", or "Mi. 21.10., 18:00" when the other
// start is on another day, so the two buttons can always be told apart.
export function startChoice(start: string, other: string): string {
  const a = new Date(start)
  const sameDay = a.toDateString() === new Date(other).toDateString()
  return sameDay ? clock.format(a) : `${day.format(a).replace(',', '')}, ${clock.format(a)}`
}

const pad = (n: number) => String(n).padStart(2, '0')

// The value of an <input type="datetime-local">: local time, to the minute.
export function toInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromInputValue(value: string): string {
  return new Date(value).toISOString()
}

// Series are defined in Berlin wall-clock time on the server. Keep their date fields independent
// from the browser's own timezone (SCRUM-153).
export function berlinDateValue(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function berlinTimeValue(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: BERLIN,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)!.value
  return `${value('hour')}:${value('minute')}`
}

// The field allows the next full minute up to MAX_DAYS_AHEAD days ahead, as the server does.
export function inputBounds(now: Date): { min: string; max: string } {
  const min = new Date(now)
  min.setSeconds(0, 0)
  min.setMinutes(min.getMinutes() + 1)
  // The backend uses `now + timedelta(days=30)`, an exact duration. Calendar-day mutation is
  // one hour too early/late when daylight-saving time changes (SCRUM-153).
  const max = new Date(now.getTime() + MAX_DAYS_AHEAD * 24 * 3_600_000)
  return { min: toInputValue(min), max: toInputValue(max) }
}
