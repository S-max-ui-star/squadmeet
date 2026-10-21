import { describe, expect, it } from 'vitest'
import { emptySlots, groupSeries, hasSeriesOccurrence, slotsInput } from './seriesGroups'

describe('Series in the Place detail (SCRUM-38)', () => {
  it('shows the next Occurrence of a Series and keeps the others for the overview', () => {
    const meetups = [
      { id: 1, series_id: 7 },
      { id: 2, series_id: null },
      { id: 3, series_id: 7 },
      { id: 4, series_id: 8 },
      { id: 5, series_id: 7 },
    ]

    const rows = groupSeries(meetups)

    expect(rows.map((r) => [r.meetup.id, r.laterOfSeries.map((m) => m.id)])).toEqual([
      [1, [3, 5]],
      [2, []],
      [4, []],
    ])
  })

  it('sends only the chosen weekdays, Monday = 0', () => {
    const fields = emptySlots()
    fields[0] = { on: true, time: '19:00', hours: 2 }
    fields[3] = { on: true, time: '18:00', hours: 3 }

    expect(slotsInput(fields)).toEqual([
      { weekday: 0, time: '19:00', hours: 2 },
      { weekday: 3, time: '18:00', hours: 3 },
    ])
  })

  it('rejects a Series whose end date leaves no future occurrence (SCRUM-152)', () => {
    const fields = emptySlots()
    // 21.10.2026 is a Wednesday. Monday is already outside this one-day window.
    fields[0] = { on: true, time: '19:00', hours: 2 }

    expect(hasSeriesOccurrence(fields, '2026-10-21', '2026-10-21', '10:00')).toBe(false)
  })

  it('accepts a later selected weekday inside the Series window (SCRUM-152)', () => {
    const fields = emptySlots()
    fields[3] = { on: true, time: '19:00', hours: 2 }

    expect(hasSeriesOccurrence(fields, '2026-10-22', '2026-10-21', '10:00')).toBe(true)
  })
})
