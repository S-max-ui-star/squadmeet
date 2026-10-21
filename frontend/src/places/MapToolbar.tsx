type Props = {
  // Contact requests waiting for an answer (SCRUM-32), shown on the person icon.
  incomingRequests: number
  onContacts: () => void
  onFavorites: () => void
  onHomeArea: () => void
  onMyMeetups: () => void
}

/** Right of the search field (SCRUM-85): Contacts, Favorites and Home area as icons, one tap
 * away instead of inside the Konto dialog, and "Meine Treffen" (SCRUM-102). Only for a
 * signed-in user. */
export default function MapToolbar({ incomingRequests, onContacts, onFavorites, onHomeArea, onMyMeetups }: Props) {
  const contacts = incomingRequests > 0 ? `Kontakte, ${incomingRequests} neue Anfragen` : 'Kontakte'
  return (
    <div className="map-toolbar" role="toolbar" aria-label="Kontakte, Favoriten, Heimatbereich, Meine Treffen">
      <button type="button" aria-label={contacts} title="Kontakte" onClick={onContacts}>
        👤{incomingRequests > 0 && <span className="notification-count">{incomingRequests}</span>}
      </button>
      <button type="button" aria-label="Favoriten" title="Favoriten" onClick={onFavorites}>
        ⭐
      </button>
      <button type="button" aria-label="Heimatbereich" title="Heimatbereich" onClick={onHomeArea}>
        📍
      </button>
      <button type="button" aria-label="Meine Treffen" title="Meine Treffen" onClick={onMyMeetups}>
        📅
      </button>
    </div>
  )
}
