import { dismissReports, fetchReportedPlaces, lockPlace, type ReportedPlace } from '../api/admin'
import { REPORT_REASONS, type PlaceReportReason } from '../api/places'
import Dialog from '../Dialog'
import { activityOf } from '../places/activities'
import { useAdminList } from './useAdminList'

type Props = {
  token: string
  // A Place is back on the map or locked: the parent loads the map again.
  onChanged: () => void
  // Open the Place detail; an Admin also sees a Place that is off the map.
  onOpenPlace: (id: number) => void
  onClose: () => void
}

function reasonsText(reasons: ReportedPlace['reasons']): string {
  return Object.entries(reasons)
    .map(([key, count]) => `${REPORT_REASONS[key as PlaceReportReason]} ${count}×`)
    .join(', ')
}

/** "Gemeldete Plätze" for Admins (SCRUM-57): Places that users reported, the hidden ones
 * first. "Verwerfen" closes the reports and the Place stays; "Sperren" makes it a Locked place
 * (SCRUM-39). */
export default function ReportedPlacesDialog({ token, onChanged, onOpenPlace, onClose }: Props) {
  const list = useAdminList<ReportedPlace>(token, fetchReportedPlaces, onChanged)
  const { items: places, error, busyId, decide } = list

  return (
    <Dialog title="Gemeldete Plätze" onClose={onClose}>
      {places === null && !error && <p>Lädt …</p>}
      {places?.length === 0 && <p>Kein Platz ist gemeldet.</p>}
      {places && places.length > 0 && (
        <ul className="waiting-suggestions">
          {places.map((item) => (
            <li key={item.id}>
              <span>
                {activityOf(item.activity_type).emoji} {item.name}
                <small>{item.address ?? `${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}`}</small>
                <small className={item.hidden ? 'osm-hint-found' : undefined}>
                  {reasonsText(item.reasons)}
                  {item.hidden ? ' · nicht auf der Karte' : ''}
                </small>
              </span>
              <div className="waiting-suggestion-actions">
                <button type="button" className="link" onClick={() => onOpenPlace(item.id)}>
                  Platz ansehen
                </button>
                {list.confirmingId === item.id ? (
                  <>
                    <button
                      type="button"
                      className="danger"
                      disabled={busyId !== null}
                      onClick={() => decide(item.id, lockPlace)}
                    >
                      Ja, sperren
                    </button>
                    <button type="button" className="link" onClick={() => list.setConfirmingId(null)}>
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={busyId !== null}
                      onClick={() => decide(item.id, dismissReports)}
                    >
                      Verwerfen
                    </button>
                    <button type="button" disabled={busyId !== null} onClick={() => list.setConfirmingId(item.id)}>
                      Sperren
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="form-error">{error}</p>}
    </Dialog>
  )
}
