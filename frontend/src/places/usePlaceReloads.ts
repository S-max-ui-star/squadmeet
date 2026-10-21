import { useEffect } from 'react'
import { whileVisible } from '../whileVisible'

// A poll in case a live event is lost; a Meetup that ends also leaves the list within this time.
const REFRESH_MS = 60_000

// Loads now, every REFRESH_MS while the page is visible, once when it comes back to the front
// (SCRUM-78), and again on each live event for this Place (SCRUM-93): onMeetupChange or
// onRatingChange from api/live.ts.
export function usePlaceReloads(
  reload: () => void,
  placeId: number,
  onChange: (listener: (placeId: number) => void) => () => void,
) {
  useEffect(() => {
    reload()
    const stopTimer = whileVisible(reload, REFRESH_MS)
    const stop = onChange((changed) => {
      if (changed === placeId) reload()
    })
    return () => {
      stopTimer()
      stop()
    }
  }, [reload, placeId, onChange])
}
