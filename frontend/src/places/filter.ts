import type { TimeSpan } from '../api/meetups'
import type { Place } from '../api/places'
import { ACTIVITIES, ACTIVITY_TYPES, type ActivityType } from './activities'

// The map shows only the Places of the chosen Activity types, with two exceptions:
// - the open Place (keepId) stays, so its marker does not vanish under the open detail panel;
// - a type the frontend does not know yet (newer backend) is never hidden; it shows with 📍.
export function filterPlaces(
  places: Place[],
  chosen: ReadonlySet<ActivityType>,
  keepId: number | null = null,
): Place[] {
  return places.filter(
    (place) =>
      place.id === keepId ||
      !(place.activity_type in ACTIVITIES) ||
      chosen.has(place.activity_type as ActivityType),
  )
}

// How many filters differ from the default (no Time choice, all activities on), for the badge on
// "Filter" in the bottom bar (SCRUM-175).
export function activeFilterCount(span: TimeSpan | null, chosen: ReadonlySet<ActivityType>): number {
  return (span ? 1 : 0) + (chosen.size < ACTIVITY_TYPES.length ? 1 : 0)
}
