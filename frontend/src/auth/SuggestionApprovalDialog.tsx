import {
  approveSuggestion,
  fetchWaitingSuggestions,
  rejectSuggestion,
  type OsmHint,
  type WaitingSuggestion,
} from '../api/admin'
import { activityOf } from '../places/activities'
import { useAdminList } from './useAdminList'

type Props = {
  token: string
  // A suggestion became a Place or is gone: the parent loads the map again.
  onChanged: () => void
  // Show the suggestion on the map, to look at its position.
  onOpenPlace: (id: number) => void
  onClose: () => void
}

const HINT_LABELS: Record<OsmHint, string> = {
  building: 'Gebäude',
  private: 'privates Gelände',
  residential: 'Wohngebiet',
}

function hintText(hints: OsmHint[] | null): string {
  if (hints === null) return 'keiner (OSM nicht erreichbar)'
  if (hints.length === 0) return 'keiner'
  return hints.map((hint) => HINT_LABELS[hint]).join(', ')
}

function reportsText(count: number): string {
  const noun = count === 1 ? 'offene Meldung' : 'offene Meldungen'
  return `${count} ${noun} (Freigeben oder Ablehnen schließt sie)`
}

function dateTime(value: string): string {
  return new Date(value).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })
}

/** "Platzvorschläge freigeben" for Admins (SCRUM-56): a suggestion with 3 Confirmations becomes
 * a Place only with an approval, at least 24 h after it was suggested. The OSM hint only helps
 * the Admin decide; it never blocks. Open Place reports are shown, because the decision closes
 * them (SCRUM-71). */
export default function SuggestionApprovalDialog({ token, onChanged, onOpenPlace, onClose }: Props) {
  const {
    items: suggestions,
    error,
    busyId,
    confirmingId: rejectingId,
    setConfirmingId: setRejectingId,
    decide,
  } = useAdminList<WaitingSuggestion>(token, fetchWaitingSuggestions, onChanged)

  return (
    <div className="dialog-backdrop">
      <div className="dialog" role="dialog" aria-label="Platzvorschläge freigeben">
        <h2>Platzvorschläge freigeben</h2>
        {suggestions === null && !error && <p>Lädt … (OSM wird geprüft)</p>}
        {suggestions?.length === 0 && <p>Kein Platzvorschlag wartet auf eine Freigabe.</p>}
        {suggestions && suggestions.length > 0 && (
          <ul className="waiting-suggestions">
            {suggestions.map((item) => (
              <li key={item.id}>
                <span>
                  {activityOf(item.activity_type).emoji} {item.name}
                  <small>
                    {item.address ?? `${item.lat.toFixed(5)}, ${item.lon.toFixed(5)}`} · {item.confirmations}{' '}
                    Bestätigungen · vorgeschlagen {dateTime(item.suggested_at)}
                  </small>
                  <small className={item.osm_hints?.length ? 'osm-hint-found' : undefined}>
                    OSM-Hinweis: {hintText(item.osm_hints)}
                  </small>
                  {item.open_reports > 0 && (
                    <small className="osm-hint-found">{reportsText(item.open_reports)}</small>
                  )}
                </span>
                <div className="waiting-suggestion-actions">
                  <button type="button" className="link" onClick={() => onOpenPlace(item.id)}>
                    Auf der Karte
                  </button>
                  {rejectingId === item.id ? (
                    <>
                      <button
                        type="button"
                        className="danger"
                        disabled={busyId !== null}
                        onClick={() => decide(item.id, rejectSuggestion)}
                      >
                        Ja, ablehnen
                      </button>
                      <button type="button" className="link" onClick={() => setRejectingId(null)}>
                        Abbrechen
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busyId !== null || !item.approvable}
                        onClick={() => decide(item.id, approveSuggestion)}
                      >
                        Freigeben
                      </button>
                      <button type="button" disabled={busyId !== null} onClick={() => setRejectingId(item.id)}>
                        Ablehnen
                      </button>
                    </>
                  )}
                  {!item.approvable && <small>Freigabe ab {dateTime(item.approvable_from)}</small>}
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <p className="form-error">{error}</p>}
        <button type="button" className="link" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  )
}
