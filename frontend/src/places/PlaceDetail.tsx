import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { canModerate } from '../api/admin'
import type { User } from '../api/auth'
import { underReview, type Place } from '../api/places'
import { activityOf } from './activities'
import AdminPlaceActions from './AdminPlaceActions'
import PlaceReportBox from './PlaceReportBox'
import PlaceShareButton from './PlaceShareButton'
import { ProblemFoldContext } from './problemFold'
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
  // SCRUM-176, not for a Place suggestion: `meetups` is "Ich bin jetzt hier", "Später treffen" and
  // the Meetups (SCRUM-29) right under the head; `favorite` is the Favorite button (SCRUM-41), one
  // of the side actions.
  parts?: { meetups?: ReactNode; favorite?: ReactNode }
  // "Karte": zoom the app map in on the Place (SCRUM-176).
  onShowOnMap?: () => void
  // The Ratings (SCRUM-31) and Photos (SCRUM-42) parts, after the side actions.
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
  // The address, or the coordinates when OpenStreetMap has none, under the name (SCRUM-176).
  const location = place && (place.address ?? `${place.lat.toFixed(5)}, ${place.lon.toFixed(5)}`)
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
        {activity && (
          <span>
            {activity.label} · <span className="place-detail-location">{location}</span>
          </span>
        )}
      </div>
      {/* At the top, so a phone user need not scroll down to close (SCRUM-76). With a tap on the
          map, the only way to close (SCRUM-174). */}
      <button ref={closeRef} type="button" className="place-detail-close" aria-label="Schließen" onClick={onClose}>
        ×
      </button>
    </div>
  )
}

type ContentProps = Pick<
  Props,
  'user' | 'onLoginNeeded' | 'onConfirmed' | 'onRemoved' | 'onReported' | 'children' | 'onShowOnMap'
> & { place: Place; meetups?: ReactNode; favorite?: ReactNode; onSnap: (snap: Snap) => void }

type ActionsProps = Pick<ContentProps, 'place' | 'onShowOnMap' | 'onSnap'> & { favorite: ReactNode }

// Route, Teilen, Favorit, Karte: one row of equal buttons (SCRUM-176). "Karte" stays in the app.
function PlaceActions({ place, favorite, onShowOnMap, onSnap }: ActionsProps) {
  // Small, so the zoomed-in Place shows above the sheet on a phone.
  function showOnMap() {
    onSnap('small')
    onShowOnMap?.()
  }

  return (
    <div className="place-actions">
      <a
        className="place-action"
        href={routeUrl(place.lat, place.lon)}
        target="_blank"
        rel="noreferrer"
        aria-label="Route planen"
      >
        <span className="place-action-icon" aria-hidden="true">➜</span>
        <span className="place-action-label">Route</span>
      </a>
      <PlaceShareButton key={`share-${place.id}`} placeId={place.id} placeName={place.name} />
      {favorite}
      <button type="button" className="place-action" aria-label="Auf der Karte zeigen" onClick={showOnMap}>
        <span className="place-action-icon" aria-hidden="true">🗺️</span>
        <span className="place-action-label">Karte</span>
      </button>
    </div>
  )
}

type FoldProps = {
  place: Place
  open: boolean
  highlighted: boolean
  onToggle: () => void
  slotRef: (el: HTMLElement | null) => void
  reportBox: ReactNode
}

// "⚠ Problem melden": the City report (from PlaceRatings, through the slot) and the Place report.
// Folded at first; open when the Place was reported already, so the note about it shows.
function ProblemFoldBox({ place, open, highlighted, onToggle, slotRef, reportBox }: FoldProps) {
  const bodyId = useId()
  return (
    <div className={highlighted ? 'problem-fold highlighted' : 'problem-fold'}>
      <button type="button" className="problem-fold-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        ⚠ Problem melden {open ? '▴' : '▾'}
      </button>
      <div id={bodyId} className="problem-fold-body" hidden={!open}>
        <div ref={slotRef} />
        {!underReview(place) && (
          <p className="hint">An die Admins, wenn es den Platz nicht gibt, er nicht öffentlich oder gefährlich ist:</p>
        )}
        {reportBox}
      </div>
    </div>
  )
}

type FoldStateProps = { place: Place; reportBox: ReactNode; children: ReactNode }

// Holds the state of "Problem melden" and gives it to the Ratings (problemFold.ts); the fold
// itself comes after the content.
function WithProblemFold({ place, reportBox, children }: FoldStateProps) {
  const [open, setOpen] = useState((place.open_reports ?? 0) > 0)
  const [highlighted, setHighlighted] = useState(false)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const openFold = useCallback(() => setOpen(true), [])
  const fold = useMemo(() => ({ slot, open: openFold, setHighlighted }), [slot, openFold])
  return (
    <ProblemFoldContext.Provider value={fold}>
      {children}
      <ProblemFoldBox
        place={place}
        open={open}
        highlighted={highlighted}
        onToggle={() => setOpen((now) => !now)}
        slotRef={setSlot}
        reportBox={reportBox}
      />
    </ProblemFoldContext.Provider>
  )
}

function PlaceDetailContent({
  place,
  user,
  onLoginNeeded,
  onConfirmed,
  onRemoved,
  onReported,
  meetups,
  favorite,
  onShowOnMap,
  onSnap,
  children,
}: ContentProps) {
  const shown = !place.is_suggestion
  const reportBox = (
    <PlaceReportBox key={`report-${place.id}`} place={place} user={user} onLoginNeeded={onLoginNeeded} onReported={onReported} />
  )
  return (
    <>
      <WithProblemFold place={place} reportBox={reportBox}>
        <SuggestionStatus key={place.id} place={place} user={user} onLoginNeeded={onLoginNeeded} onConfirmed={onConfirmed} />
        {shown && meetups}
        <PlaceActions place={place} favorite={shown ? favorite : null} onShowOnMap={onShowOnMap} onSnap={onSnap} />
        {shown && children}
      </WithProblemFold>
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
  parts = {},
  onShowOnMap,
  children,
}: Props) {
  const titleId = useId()
  const closeRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLElement>(null)
  // Phones only (SCRUM-167); the laptop CSS ignores it.
  const [snap, setSnap] = useState<Snap>('half')

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
          meetups={parts.meetups}
          favorite={parts.favorite}
          onShowOnMap={onShowOnMap}
          onSnap={setSnap}
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
    </section>
  )
}

