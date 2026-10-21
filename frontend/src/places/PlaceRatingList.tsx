import { useCallback, useState } from 'react'
import { loadToken } from '../api/auth'
import { onRatingChange } from '../api/live'
import { fetchRatingList, type RatingListItem } from '../api/ratings'
import { useLatestRequest } from './useLatestRequest'
import { usePlaceReloads } from './usePlaceReloads'

type Props = {
  placeId: number
  count: number
}

const date = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  timeZone: 'Europe/Berlin',
})

function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(5 - stars)
}

function RatingLine({ rating }: { rating: RatingListItem }) {
  return (
    <li className="rating-list-item">
      <span className="rating-list-head">
        <span className="stars" aria-label={`${rating.stars} von 5 Sternen`}>
          {starText(rating.stars)}
        </span>
        <time dateTime={rating.updated_at}>{date.format(new Date(rating.updated_at))}</time>
      </span>
      <span className="rating-list-reasons">{rating.reasons.join(' · ')}</span>
    </li>
  )
}

function RatingLines({ ratings, error }: { ratings: RatingListItem[] | null; error: string | null }) {
  return (
    <>
      {ratings === null && !error && <p className="hint">Lädt …</p>}
      {ratings && (
        <ul>
          {ratings.map((rating, index) => (
            <RatingLine key={`${rating.updated_at}-${index}`} rating={rating} />
          ))}
        </ul>
      )}
      {error && <p className="form-error">{error}</p>}
    </>
  )
}

export default function PlaceRatingList({ placeId, count }: Props) {
  const [open, setOpen] = useState(false)
  const [ratings, setRatings] = useState<RatingListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Only the newest load is shown; a good one clears an old error (SCRUM-156).
  const { run, cancel } = useLatestRequest()

  const reload = useCallback(() => {
    if (!open) {
      cancel()
      return
    }
    run(
      (signal) => fetchRatingList(placeId, loadToken(), signal),
      (found) => {
        setRatings(found)
        setError(null)
      },
      (err) => setError(err.message),
    )
  }, [open, placeId, run, cancel])

  // Keep an open list in sync with SCRUM-98, but do not load it while it is folded in.
  usePlaceReloads(reload, placeId, onRatingChange)

  function toggle() {
    if (!open) setError(null)
    setOpen(!open)
  }

  if (count === 0) return null
  return (
    <div className="rating-list">
      <button type="button" className="rating-list-toggle" aria-expanded={open} onClick={toggle}>
        Alle Bewertungen ({count}) {open ? '▴' : '▾'}
      </button>
      {open && <RatingLines ratings={ratings} error={error} />}
    </div>
  )
}
