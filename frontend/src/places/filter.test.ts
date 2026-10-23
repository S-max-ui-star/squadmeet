import { describe, expect, it } from 'vitest'
import type { Place } from '../api/places'
import { ACTIVITY_TYPES, type ActivityType } from './activities'
import { activeFilterCount, filterPlaces } from './filter'

const place = (id: number, activity_type: string): Place => ({
  id,
  name: '',
  activity_type,
  lat: 0,
  lon: 0,
  people_now: 0,
  is_suggestion: false,
  confirmations: 0,
})
const places = [place(1, 'table_tennis'), place(2, 'basketball'), place(3, 'football')]

describe('filterPlaces', () => {
  it('keeps only the chosen Activity types', () => {
    const chosen = new Set<ActivityType>(['table_tennis', 'football'])
    expect(filterPlaces(places, chosen).map((p) => p.id)).toEqual([1, 3])
  })

  it('shows nothing when nothing is chosen', () => {
    expect(filterPlaces(places, new Set())).toEqual([])
  })

  it('keeps the open Place even when its type is switched off', () => {
    const chosen = new Set<ActivityType>(['table_tennis'])
    expect(filterPlaces(places, chosen, 3).map((p) => p.id)).toEqual([1, 3])
  })

  it('never hides a type that the frontend does not know', () => {
    const unknown = place(4, 'chess')
    expect(filterPlaces([...places, unknown], new Set()).map((p) => p.id)).toEqual([4])
  })
})

describe('activeFilterCount (SCRUM-175)', () => {
  const all = new Set(ACTIVITY_TYPES)

  it('is 0 for the default: no Time choice, all activities on', () => {
    expect(activeFilterCount(null, all)).toBe(0)
  })

  it('counts a Time choice and fewer activities, once each', () => {
    expect(activeFilterCount('3h', all)).toBe(1)
    expect(activeFilterCount(null, new Set<ActivityType>(['basketball']))).toBe(1)
    expect(activeFilterCount('now', new Set<ActivityType>(['basketball', 'football']))).toBe(2)
  })
})
