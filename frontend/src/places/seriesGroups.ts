// Weekly Series (SCRUM-38): the Place detail shows the next Occurrence of each Series, and the
// others only in the overview "Alle Termine". The list from the API is sorted by start.

type Item = { id: number; series_id: number | null }

export type Row<T extends Item> = { meetup: T; laterOfSeries: T[] }

export function groupSeries<T extends Item>(meetups: T[]): Row<T>[] {
  const rows: Row<T>[] = []
  const first = new Map<number, Row<T>>()
  for (const meetup of meetups) {
    if (meetup.series_id === null) {
      rows.push({ meetup, laterOfSeries: [] })
      continue
    }
    const row = first.get(meetup.series_id)
    if (row) {
      row.laterOfSeries.push(meetup)
    } else {
      const created = { meetup, laterOfSeries: [] }
      first.set(meetup.series_id, created)
      rows.push(created)
    }
  }
  return rows
}

export const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']

export type SlotFields = { on: boolean; time: string; hours: number }

// One row per weekday (Monday first), all off, 19:00 for 2 h.
export function emptySlots(): SlotFields[] {
  return WEEKDAYS.map(() => ({ on: false, time: '19:00', hours: 2 }))
}

// The API body for the chosen weekdays (weekday 0 = Monday, as the server counts).
export function slotsInput(fields: SlotFields[]): { weekday: number; time: string; hours: number }[] {
  return fields.flatMap((f, weekday) => (f.on ? [{ weekday, time: f.time, hours: f.hours }] : []))
}

const addDays = (isoDate: string, days: number) => {
  const date = new Date(`${isoDate}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const weekdayOf = (isoDate: string) => {
  const sundayFirst = new Date(`${isoDate}T12:00:00Z`).getUTCDay()
  return (sundayFirst + 6) % 7
}

// At least one selected Berlin wall-clock slot must still be in the creation window. Without an
// end date every selected weekday necessarily occurs within the next week (SCRUM-152).
export function hasSeriesOccurrence(
  fields: SlotFields[],
  until: string,
  berlinDate: string,
  berlinTime: string,
): boolean {
  if (!until) return fields.some((field) => field.on)
  for (let date = berlinDate; date <= until; date = addDays(date, 1)) {
    const field = fields[weekdayOf(date)]
    if (field.on && (date > berlinDate || field.time > berlinTime)) return true
  }
  return false
}
