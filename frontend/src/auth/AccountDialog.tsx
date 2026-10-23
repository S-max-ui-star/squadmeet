import type { ReactNode } from 'react'
import { canModerate } from '../api/admin'
import type { User } from '../api/auth'
import Dialog from '../Dialog'
import LegalLinks from '../legal/LegalLinks'
import { AVATARS } from './avatars'

type Props = {
  user: User
  onPush: () => void
  onHomeArea: () => void
  onMfa: () => void
  onLogout: () => void
  onDelete: () => void
  onLockedPlaces: () => void
  onSuggestions: () => void
  onReports: () => void
  // Photos are on (SCRUM-94); off, "Fotos freigeben" is hidden.
  photos: boolean
  onPhotos: () => void
  onClose: () => void
}

function Row({ onClick, value, className, children }: {
  onClick: () => void
  // Shown on the right, for example "an" or "aus".
  value?: string
  className?: string
  children: ReactNode
}) {
  return (
    <button type="button" className={className ? `account-row ${className}` : 'account-row'} onClick={onClick}>
      {children}
      {value && <span className="account-row-value">{value}</span>}
    </button>
  )
}

/** "Konto" (SCRUM-28): the account settings as a grouped list (SCRUM-169). Abmelden and the Home
 * area are here, so the top bar and the bottom bar on a phone stay short. "Konto löschen" is last
 * and red, apart from the rest. */
export default function AccountDialog({
  user,
  onPush,
  onHomeArea,
  onMfa,
  onLogout,
  onDelete,
  onLockedPlaces,
  onSuggestions,
  onReports,
  photos,
  onPhotos,
  onClose,
}: Props) {
  return (
    <Dialog title="Konto" className="account-dialog" onClose={onClose}>
      <div className="account-profile">
        <span className="account-avatar" aria-hidden="true">
          {AVATARS[user.avatar]?.emoji}
        </span>
        <strong>{user.nickname}</strong>
      </div>
      <section className="account-group">
        <h3>Einstellungen</h3>
        <Row onClick={onPush}>Push-Benachrichtigungen</Row>
        <Row onClick={onHomeArea}>Heimatbereich</Row>
        <Row onClick={onMfa} value={user.mfa_enabled ? 'an' : 'aus'}>
          Zwei-Faktor-Anmeldung
        </Row>
      </section>
      {canModerate(user) && (
        <section className="account-group">
          <h3>Moderation</h3>
          <Row onClick={onSuggestions}>Platzvorschläge freigeben</Row>
          <Row onClick={onReports}>Gemeldete Plätze</Row>
          {photos && <Row onClick={onPhotos}>Fotos freigeben</Row>}
          <Row onClick={onLockedPlaces}>Gesperrte Plätze</Row>
        </section>
      )}
      <section className="account-group">
        <h3>Sonstiges</h3>
        {/* No navigate: the pages open in a new tab, as before (LegalLinks). */}
        <LegalLinks className="legal-links-inline" />
        <Row onClick={onLogout}>Abmelden</Row>
      </section>
      <section className="account-group account-danger">
        <Row onClick={onDelete} className="destructive">
          Konto löschen
        </Row>
      </section>
    </Dialog>
  )
}
