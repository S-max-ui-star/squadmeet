import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react'
import { canModerate } from '../api/admin'
import type { User } from '../api/auth'
import type { Place } from '../api/places'
import { activityOf } from './activities'
import AdminPlaceActions from './AdminPlaceActions'
import PlaceReportBox from './PlaceReportBox'
import PlaceShareButton from './PlaceShareButton'
import SheetGrip from './SheetGrip'
import type { Snap } from './sheetSnap'
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

type HeadProps = Pick<Props, 'place' | 'error' | 'onClose'> & {
  titleId: string
  closeRef: RefObject<HTMLButtonElement | null>
  grip: ReactNode
}

function PlaceDetailHead({ place, error, onClose, titleId, closeRef, grip }: HeadProps) {
  const activity = place && activityOf(place.activity_type)
  return (
    <div className="place-detail-head">
      {/* In the sticky head, so the grip stays in reach while the sheet scrolls (SCRUM-167). */}
      {grip}
      {activity && (
        <span className="place-detail-emoji" style={{ borderColor: activity.color }} aria-hidden="true">
          {activity.emoji}
        </span>
      )}
      <div className="place-detail-title">
        <h2 id={titleId}>{place?.name ?? (error ? 'Platz nicht gefunden' : 'Lädt …')}</h2>
        {activity && <span>{activity.label}</span>}
      </div>
      {/* At the top, so a phone user need not scroll down to "Zurück zur Karte" (SCRUM-76). */}
      <button ref={closeRef} type="button" className="place-detail-close" aria-label="Schließen" onClick={onClose}>
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
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  // Phones only (SCRUM-167); the laptop CSS ignores it.
  const [snap, setSnap] = useState<Snap>('half')

  // Small shows the main action under the title: the sheet scrolls "Ich bin jetzt hier" up.
  useEffect(() => {
    const sheet = sheetRef.current
    if (snap !== 'small' || !sheet) return
    const action = sheet.querySelector('.now-button')
    const head = sheet.querySelector('.place-detail-head')
    if (!action || !head) return
    sheet.scrollTop += action.getBoundingClientRect().top - head.getBoundingClientRect().bottom - 8
  }, [snap])

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    closeRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (opener?.isConnected) opener.focus()
    }
  }, [onClose])

  return (
    <section ref={sheetRef} className="place-detail" data-snap={snap} aria-labelledby={titleId}>
      <PlaceDetailHead
        place={place}
        error={error}
        onClose={onClose}
        titleId={titleId}
        closeRef={closeRef}
        grip={<SheetGrip snap={snap} onSnap={setSnap} sheetRef={sheetRef} />}
      />

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

