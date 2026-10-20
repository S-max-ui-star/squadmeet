import { describe, expect, it } from 'vitest'
import { MAX_DAYS_AHEAD, fromInputValue, inputBounds, slot, startChoice, toInputValue } from './meetupTime'

const now = new Date(2026, 9, 12, 10, 30) // Mon 12.10.2026 10:30, local time

describe('slot', () => {
  it('shows weekday, date and the time span', () => {
    const meetup = { starts_at: new Date(2026, 9, 17, 18, 0).toISOString(), ends_at: new Date(2026, 9, 17, 20, 0).toISOString() }
    expect(slot(meetup)).toBe('Sa. 17.10., 18:00–20:00 Uhr')
  })
})

describe('startChoice (SCRUM-79)', () => {
  const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0).toISOString()

  it('is only the time when both starts are on the same day', () => {
    expect(startChoice(at(17, 18), at(17, 17))).toBe('18:00')
  })

  it('names the day when the other start is on another day', () => {
    expect(startChoice(at(21, 18), at(17, 17))).toBe('Mi. 21.10., 18:00')
  })
})

describe('the date and time field', () => {
  it('turns a local time into the field value and back', () => {
    const date = new Date(2026, 9, 17, 18, 5)
    expect(toInputValue(date)).toBe('2026-10-17T18:05')
    expect(new Date(fromInputValue('2026-10-17T18:05')).getTime()).toBe(date.getTime())
  })

  it('sends the time with its time zone, so the server knows the moment', () => {
    expect(fromInputValue('2026-10-17T18:05')).toMatch(/Z$/)
  })

  it(`allows the next minute up to ${MAX_DAYS_AHEAD} days ahead`, () => {
    const { min, max } = inputBounds(now)
    expect(min).toBe('2026-10-12T10:31')
    expect(max).toBe('2026-11-11T10:30')
  })
})
