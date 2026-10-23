type Props = {
  loggedIn: boolean
  // Filters that differ from the default (SCRUM-175), shown on Filter.
  activeFilters: number
  // Contact requests waiting for an answer (SCRUM-32), shown on Kontakte.
  incomingRequests: number
  onFilter: () => void
  onLogin: () => void
  onMyMeetups: () => void
  onFavorites: () => void
  onContacts: () => void
}

/** Phones only (SCRUM-165): a bar at the bottom with icon and label, in reach of the thumb. It
 * replaces the MapToolbar there; the CSS shows one of the two. The Home area is in Konto
 * (SCRUM-169). "Filter" opens the filter sheet, because the filter rows are not on the map on a
 * phone; a visitor gets "Filter" and "Anmelden" (SCRUM-175). */
export default function BottomNav({
  loggedIn,
  activeFilters,
  incomingRequests,
  onFilter,
  onLogin,
  onMyMeetups,
  onFavorites,
  onContacts,
}: Props) {
  const filter = activeFilters > 0 ? `Filter, ${activeFilters} aktiv` : 'Filter'
  const contacts = incomingRequests > 0 ? `Kontakte, ${incomingRequests} neue Anfragen` : 'Kontakte'
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      <button type="button" aria-label={filter} onClick={onFilter}>
        <span aria-hidden="true">🎚️</span>
        Filter
        {activeFilters > 0 && <span className="filter-count">{activeFilters}</span>}
      </button>
      {loggedIn ? (
        <>
          <button type="button" aria-label="Meine Treffen" onClick={onMyMeetups}>
            <span aria-hidden="true">🤝</span>
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
        </>
      ) : (
        <button type="button" onClick={onLogin}>
          <span aria-hidden="true">🔑</span>
          Anmelden
        </button>
      )}
    </nav>
  )
}
