import type { ReactNode } from 'react'
import { canModerate } from '../api/admin'
import type { User } from '../api/auth'
import type { Place } from '../api/places'
import { activityOf } from './activities'
import AdminPlaceActions from './AdminPlaceActions'
import PlaceReportBox from './PlaceReportBox'
import PlaceShareButton from './PlaceShareButton'
import { routeUrl } from './routeLink'
import SuggestionStatus from './SuggestionStatus'

type Props = {
  place: Place | null
  error: string | null
  onRetry: () => void
  onClose: () => void
  user?: User | null
  onLoginNeeded?: () => void
  onConfirmed?: (place: Place) => void
  // An Admin locked or deleted the Place (SCRUM-39).
  onRemoved?: () => void
  // The user reported the Place (SCRUM-57).
  onReported?: () => void
  // The Meetups (SCRUM-29) and Ratings (SCRUM-31) parts, shown once the Place is loaded.
  // Not for a Place suggestion.
  children?: ReactNode
}

type HeadProps = Pick<Props, 'place' | 'error' | 'onClose'>

function PlaceDetailHead({ place, error, onClose }: HeadProps) {
  const activity = place && activityOf(place.activity_type)
  return (
    <div className="place-detail-head">
      {activity && (
        <span className="place-detail-emoji" style={{ borderColor: activity.color }} aria-hidden="true">
          {activity.emoji}
        </span>
      )}
      <div className="place-detail-title">
        <h2>{place?.name ?? (error ? 'Platz nicht gefunden' : 'Lädt …')}</h2>
        {activity && <span>{activity.label}</span>}
      </div>
      {/* At the top, so a phone user need not scroll down to "Zurück zur Karte" (SCRUM-76). */}
      <button type="button" className="place-detail-close" aria-label="Schließen" onClick={onClose}>
        ×
      </button>
    </div>
  )
}

type ContentProps = Pick<
  Props,
  'user' | 'onLoginNeeded' | 'onConfirmed' | 'onRemoved' | 'onReported' | 'children'
> & { place: Place }

function PlaceDetailContent({
  place,
  user,
  onLoginNeeded,
  onConfirmed,
  onRemoved,
  onReported,
  children,
}: ContentProps) {
  const coordinates = `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`
  return (
    <>
      <SuggestionStatus
        key={place.id}
        place={place}
        user={user}
        onLoginNeeded={onLoginNeeded}
        onConfirmed={onConfirmed}
      />
      <p className="place-detail-location">
        <strong>{place.address ? 'Adresse' : 'Lage'}</strong>
        <span>{place.address ?? coordinates}</span>
        <a className="place-detail-route" href={routeUrl(place.lat, place.lon)} target="_blank" rel="noreferrer">
          Route planen
        </a>{' '}
        <a
          href={`https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=18/${place.lat}/${place.lon}`}
          target="_blank"
          rel="noreferrer"
        >
          In OpenStreetMap ansehen
        </a>
        <br />
        <PlaceShareButton key={`share-${place.id}`} placeId={place.id} placeName={place.name} />
      </p>
      {!place.is_suggestion && children}
      <PlaceReportBox
        key={`report-${place.id}`}
        place={place}
        user={user}
        onLoginNeeded={onLoginNeeded}
        onReported={onReported}
      />
      {/* Also for a Place suggestion: an invented Place is a reason to lock it. */}
      {canModerate(user) && (
        <AdminPlaceActions key={`admin-${place.id}`} placeId={place.id} onRemoved={() => onRemoved?.()} />
      )}
    </>
  )
}

// The Place detail page: a panel over the bottom of the map (layout from SCRUM-17), so the
// map still shows where the Place is.
export default function PlaceDetail({
  place,
  error,
  onRetry,
  onClose,
  user,
  onLoginNeeded,
  onConfirmed,
  onRemoved,
  onReported,
  children,
}: Props) {
  return (
    <section className="place-detail" aria-label={place?.name ?? 'Platz'}>
      <PlaceDetailHead place={place} error={error} onClose={onClose} />

      {place && (
        <PlaceDetailContent
          place={place}
          user={user}
          onLoginNeeded={onLoginNeeded}
          onConfirmed={onConfirmed}
          onRemoved={onRemoved}
          onReported={onReported}
        >
          {children}
        </PlaceDetailContent>
      )}
      {error && (
        <>
          <p className="form-error">{error}</p>
          <button type="button" className="place-detail-retry" onClick={onRetry}>
            Nochmal versuchen
          </button>
        </>
      )}

      <a
        className="place-detail-back"
        href="/"
        onClick={(event) => {
          event.preventDefault()
          onClose()
        }}
      >
        ‹ Zurück zur Karte
      </a>
    </section>
  )
}

