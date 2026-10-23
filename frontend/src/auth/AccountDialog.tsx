import { canModerate } from '../api/admin'
import type { User } from '../api/auth'
import Dialog from '../Dialog'
import LegalLinks from '../legal/LegalLinks'

type Props = {
  user: User
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

/** "Konto": the account actions in one place, so the bar on a phone stays one line (SCRUM-28).
 * Contacts, Favorites and Home area moved to the toolbar next to the search (SCRUM-85). */
export default function AccountDialog({
  user,
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
    <Dialog title="Konto" onClose={onClose}>
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
      <LegalLinks className="legal-links-inline" />
    </Dialog>
  )
}
