import { canModerate } from '../api/admin'
import type { User } from '../api/auth'
import LegalLinks from '../legal/LegalLinks'

type Props = {
  user: User
  // Contact requests waiting for an answer (SCRUM-32).
  incomingRequests: number
  onContacts: () => void
  onFavorites: () => void
  onHomeArea: () => void
  onPush: () => void
  onMfa: () => void
  onDelete: () => void
  onLockedPlaces: () => void
  onSuggestions: () => void
  onReports: () => void
  // Photos are on (SCRUM-94); off, "Fotos freigeben" is hidden.
  photos: boolean
  onPhotos: () => void
  onClose: () => void
}

/** "Konto": the account actions in one place, so the bar on a phone stays one line (SCRUM-28). */
export default function AccountDialog({
  user,
  incomingRequests,
  onContacts,
  onFavorites,
  onHomeArea,
  onPush,
  onMfa,
  onDelete,
  onLockedPlaces,
  onSuggestions,
  onReports,
  photos,
  onPhotos,
  onClose,
}: Props) {
  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-label="Konto">
        <h2>Konto</h2>
        <button type="button" onClick={onContacts}>
          Kontakte{incomingRequests > 0 && ` (${incomingRequests} neu)`}
        </button>
        <button type="button" onClick={onFavorites}>
          Favoriten
        </button>
        <button type="button" onClick={onHomeArea}>
          Heimatbereich
        </button>
        <button type="button" onClick={onPush}>
          Push-Benachrichtigungen
        </button>
        <button type="button" onClick={onMfa}>
          Zwei-Faktor-Anmeldung ({user.mfa_enabled ? 'an' : 'aus'})
        </button>
        {canModerate(user) && (
          <>
            <button type="button" onClick={onSuggestions}>
              Platzvorschläge freigeben
            </button>
            <button type="button" onClick={onReports}>
              Gemeldete Plätze
            </button>
            {photos && (
              <button type="button" onClick={onPhotos}>
                Fotos freigeben
              </button>
            )}
            <button type="button" onClick={onLockedPlaces}>
              Gesperrte Plätze
            </button>
          </>
        )}
        <button type="button" onClick={onDelete}>
          Konto löschen
        </button>
        <button type="button" className="link" onClick={onClose}>
          Schließen
        </button>
        <LegalLinks className="legal-links-inline" />
      </div>
    </div>
  )
}
