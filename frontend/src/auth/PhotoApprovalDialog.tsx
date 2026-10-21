import { approvePhoto, fetchPendingPhotos, rejectPhoto, type PendingPhoto } from '../api/photos'
import Dialog from '../Dialog'
import { activityOf } from '../places/activities'
import { useAdminList } from './useAdminList'

type Props = {
  token: string
  // A Photo was approved: the parent loads the open Place detail again.
  onChanged: () => void
  onOpenPlace: (id: number) => void
  onClose: () => void
}

const dateTime = new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' })

/** "Fotos freigeben" for Admins (SCRUM-42): the pending Photos, the oldest first. "Freigeben"
 * shows the Photo on the Place detail; "Ablehnen" deletes it (second step "Ja, ablehnen"). */
export default function PhotoApprovalDialog({ token, onChanged, onOpenPlace, onClose }: Props) {
  const list = useAdminList<PendingPhoto>(token, fetchPendingPhotos, onChanged)
  const { items: photos, error, busyId, decide } = list

  return (
    <Dialog title="Fotos freigeben" onClose={onClose}>
      {photos === null && !error && <p>Lädt …</p>}
      {photos?.length === 0 && <p>Kein Foto wartet auf die Freigabe.</p>}
      {photos && photos.length > 0 && (
        <ul className="pending-photos">
          {photos.map((item) => (
            <li key={item.id}>
              <a href={item.url} target="_blank" rel="noreferrer">
                <img src={item.url} width={item.width} height={item.height} alt={`Foto für ${item.place_name}`} />
              </a>
              <span>
                {activityOf(item.activity_type).emoji} {item.place_name}
                <small>
                  {item.nickname ?? 'gelöschtes Konto'} · {dateTime.format(new Date(item.created_at))}
                </small>
              </span>
              <div className="waiting-suggestion-actions">
                <button type="button" className="link" onClick={() => onOpenPlace(item.place_id)}>
                  Platz ansehen
                </button>
                {list.confirmingId === item.id ? (
                  <>
                    <button
                      type="button"
                      className="danger"
                      disabled={busyId !== null}
                      onClick={() => decide(item.id, rejectPhoto)}
                    >
                      Ja, ablehnen
                    </button>
                    <button type="button" className="link" onClick={() => list.setConfirmingId(null)}>
                      Abbrechen
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" disabled={busyId !== null} onClick={() => decide(item.id, approvePhoto)}>
                      Freigeben
                    </button>
                    <button type="button" disabled={busyId !== null} onClick={() => list.setConfirmingId(item.id)}>
                      Ablehnen
                    </button>
                  </>
                )}
              </div>
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
