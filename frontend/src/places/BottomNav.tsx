type Props = {
  // Contact requests waiting for an answer (SCRUM-32), shown on Kontakte.
  incomingRequests: number
  onMap: () => void
  onMyMeetups: () => void
  onFavorites: () => void
  onContacts: () => void
}

/** Phones only (SCRUM-165): a bar at the bottom with icon and label, in reach of the thumb. It
 * replaces the MapToolbar there; the CSS shows one of the two. The Home area is in Konto
 * (SCRUM-169). Only for a signed-in user. */
export default function BottomNav({ incomingRequests, onMap, onMyMeetups, onFavorites, onContacts }: Props) {
  const contacts = incomingRequests > 0 ? `Kontakte, ${incomingRequests} neue Anfragen` : 'Kontakte'
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {/* The map is always behind the dialogs; "Karte" closes an open Place. */}
      <button type="button" aria-current="page" onClick={onMap}>
        <span aria-hidden="true">🗺️</span>
        Karte
      </button>
      <button type="button" aria-label="Meine Treffen" onClick={onMyMeetups}>
        <span aria-hidden="true">📅</span>
        Treffen
      </button>
      <button type="button" onClick={onFavorites}>
        <span aria-hidden="true">⭐</span>
        Favoriten
      </button>
      <button type="button" aria-label={contacts} onClick={onContacts}>
        <span aria-hidden="true">👤</span>
        Kontakte
        {incomingRequests > 0 && <span className="notification-count">{incomingRequests}</span>}
      </button>
    </nav>
  )
}
