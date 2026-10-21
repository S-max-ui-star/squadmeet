import { fetchLockedPlaces, unlockPlace, type LockedPlace } from '../api/admin'
import Dialog from '../Dialog'
import { activityOf } from '../places/activities'
import { useAdminList } from './useAdminList'

type Props = {
  token: string
  // A Place is back on the map: the parent loads the map again.
  onUnlocked: () => void
  onClose: () => void
}

/** "Gesperrte Plätze" for Admins (SCRUM-39): a locked Place is not on the map, so it is
 * unlocked from this list. */
export default function LockedPlacesDialog({ token, onUnlocked, onClose }: Props) {
  const { items: places, error, busyId, decide } = useAdminList<LockedPlace>(token, fetchLockedPlaces, onUnlocked)

  return (
    <Dialog title="Gesperrte Plätze" onClose={onClose}>
      {places === null && !error && <p>Lädt …</p>}
      {places?.length === 0 && <p>Kein Platz ist gesperrt.</p>}
      {places && places.length > 0 && (
        <ul className="locked-places">
          {places.map((place) => (
            <li key={place.id}>
              <span>
                {activityOf(place.activity_type).emoji} {place.name}
                <small>
                  {place.address ?? `Platz ${place.id}`} · gesperrt am{' '}
                  {new Date(place.locked_at).toLocaleDateString('de-DE')}
                </small>
              </span>
              <button type="button" disabled={busyId !== null} onClick={() => decide(place.id, unlockPlace)}>
                Entsperren
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="form-error">{error}</p>}
      <button type="button" className="link" onClick={onClose}>
        Schließen
      </button>
    </Dialog>
  )
}
