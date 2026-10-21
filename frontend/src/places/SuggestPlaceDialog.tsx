import { useEffect, useState, type FormEvent } from 'react'
import type { Place } from '../api/places'
import {
  DUPLICATE_RADIUS_M,
  fetchNearby,
  locate,
  suggestPlace,
  type NearbyPlace,
  type Position,
} from '../api/suggestions'
import Dialog from '../Dialog'
import LegalLinks from '../legal/LegalLinks'
import { ACTIVITIES, ACTIVITY_TYPES, activityOf, type ActivityType } from './activities'

type Props = {
  token: string
  // The new Place suggestion was saved.
  onCreated: (place: Place) => void
  // The user picked an existing Place from the duplicate warning.
  onOpenPlace: (id: number) => void
  onClose: () => void
}

const MAX_NAME_LENGTH = 60

/** Suggest a missing Place at the user's position, with the duplicate warning (SCRUM-30). */
export default function SuggestPlaceDialog({ token, onCreated, onOpenPlace, onClose }: Props) {
  const [position, setPosition] = useState<Position | null>(null)
  const [locateTry, setLocateTry] = useState(0)
  const [activityType, setActivityType] = useState<ActivityType | null>(null)
  const [name, setName] = useState('')
  // Places of the same Activity type nearby; null = not checked yet.
  const [duplicates, setDuplicates] = useState<NearbyPlace[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let stillWanted = true
    locate()
      .then((found) => stillWanted && setPosition(found))
      .catch((err: Error) => stillWanted && setError(err.message))
    return () => {
      stillWanted = false
    }
  }, [locateTry])

  async function run(action: () => Promise<void>) {
    setError(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function save(where: Position, type: ActivityType) {
    onCreated(await suggestPlace(token, { activity_type: type, lat: where.lat, lon: where.lon, name }))
  }

  // First the duplicate warning; without Places nearby the suggestion is saved at once.
  function check(event: FormEvent) {
    event.preventDefault()
    if (!position || !activityType) return
    run(async () => {
      const found = await fetchNearby({ activity_type: activityType, lat: position.lat, lon: position.lon })
      if (found.length === 0) await save(position, activityType)
      else setDuplicates(found)
    })
  }

  if (duplicates) {
    return (
      <Dialog title="Ist es einer davon?" onClose={onClose}>
        <p className="hint">
          Hier gibt es schon {duplicates.length === 1 ? 'einen Platz' : `${duplicates.length} Plätze`} für{' '}
          {activityOf(activityType!).label} in {DUPLICATE_RADIUS_M} m.
        </p>
        <ul className="duplicate-list">
          {duplicates.map((place) => (
            <li key={place.id}>
              <button type="button" onClick={() => onOpenPlace(place.id)}>
                <strong>{place.name}</strong>
                <span>
                  {place.distance_m} m entfernt{place.is_suggestion && ' · noch nicht bestätigt'}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {error && <p className="form-error">{error}</p>}
        <button type="button" disabled={busy} onClick={() => run(() => save(position!, activityType!))}>
          Nein, neuer Platz
        </button>
        <button type="button" className="link" onClick={onClose}>
          Abbrechen
        </button>
        <LegalLinks className="legal-links-inline" />
      </Dialog>
    )
  }

  return (
    <Dialog title="Platz vorschlagen" onClose={onClose} onSubmit={check}>
      <p className="hint">Du stehst an einem Platz, der auf der Karte fehlt? Schlag ihn hier vor.</p>

      {position ? (
        <p className="hint">
          📍 Deine Position (auf {Math.round(position.accuracy)} m genau)
          {position.accuracy > DUPLICATE_RADIUS_M && '. Ungenau: warte kurz und versuche es noch einmal.'}
        </p>
      ) : (
        !error && <p className="hint">Standort wird bestimmt …</p>
      )}
      {!position && error && (
        <button type="button" onClick={() => setLocateTry((n) => n + 1)}>
          Standort nochmal bestimmen
        </button>
      )}

      <fieldset className="activity-choice">
        <legend>Aktivität</legend>
        {ACTIVITY_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            aria-pressed={type === activityType}
            className={type === activityType ? 'on' : ''}
            style={{ borderColor: ACTIVITIES[type].color }}
            onClick={() => setActivityType(type)}
          >
            {ACTIVITIES[type].emoji} {ACTIVITIES[type].label}
          </button>
        ))}
      </fieldset>

      <label>
        Name (freiwillig)
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME_LENGTH}
          placeholder="z. B. Platte am Teich"
        />
      </label>

      <p className="hint">Andere sehen den Vorschlag auf der Karte. Er braucht 3 Bestätigungen, deine zählt als erste.</p>
      {error && <p className="form-error">{error}</p>}
      <button type="submit" disabled={busy || !position || !activityType}>
        Weiter
      </button>
      <button type="button" className="link" onClick={onClose}>
        Abbrechen
      </button>
      <LegalLinks className="legal-links-inline" />
    </Dialog>
  )
}
