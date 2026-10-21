import { useEffect, useState } from 'react'
import { fetchHomeArea, saveHomeArea, turnOffHomeArea, type HomeArea } from '../api/homeArea'
import { ACTIVITIES, ACTIVITY_TYPES, type ActivityType } from '../places/activities'
import HomeAreaMap, { type Point } from './HomeAreaMap'
import Dialog from '../Dialog'

type Props = {
  token: string
  fallbackCenter: [number, number]
  onClose: () => void
}

const DEFAULT_RADIUS_KM = 3

// The form's values; `on`: the server has a Home area for the user.
type Form = { on: boolean; point: Point | null; radiusKm: number; types: Set<ActivityType> }

const EMPTY: Form = { on: false, point: null, radiusKm: DEFAULT_RADIUS_KM, types: new Set(ACTIVITY_TYPES) }

function formOf(area: HomeArea | null): Form {
  if (!area) return EMPTY
  return {
    on: true,
    point: { lat: area.lat, lon: area.lon },
    radiusKm: area.radius_km,
    types: new Set(area.activity_types),
  }
}

/** "Heimatbereich" (SCRUM-45, ADR-0003): a point the user taps, a radius of 1–20 km and the
 * Activity types. A new Meetup inside it gives a Notification. Turning it off deletes the point. */
export default function HomeAreaDialog({ token, fallbackCenter, onClose }: Props) {
  const [form, setForm] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchHomeArea(token)
      .then((area) => setForm(formOf(area)))
      .catch((err: Error) => {
        setForm(EMPTY)
        setError(err.message)
      })
  }, [token])

  function change(next: Partial<Form>) {
    setForm((old) => old && { ...old, ...next })
    setMessage(null)
  }

  // Runs one request; the form shows `done` after it, or the server's error.
  async function run(request: () => Promise<Form>, done: string, failed: string) {
    setBusy(true)
    setError(null)
    try {
      setForm(await request())
      setMessage(done)
    } catch (err) {
      setError(err instanceof Error ? err.message : failed)
    } finally {
      setBusy(false)
    }
  }

  function save(current: Form, point: Point) {
    return run(
      async () => {
        await saveHomeArea(token, {
          lat: point.lat,
          lon: point.lon,
          radius_km: current.radiusKm,
          activity_types: ACTIVITY_TYPES.filter((type) => current.types.has(type)),
        })
        return { ...current, on: true }
      },
      'Gespeichert. Neue Treffen in diesem Bereich melden wir dir.',
      'Speichern fehlgeschlagen.',
    )
  }

  function turnOff() {
    return run(
      async () => {
        await turnOffHomeArea(token)
        return EMPTY
      },
      'Ausgeschaltet. Der Punkt ist gelöscht.',
      'Ausschalten fehlgeschlagen.',
    )
  }

  return (
    <Dialog title="Heimatbereich" onClose={onClose}>
      {form === null ? (
        <p>Laden …</p>
      ) : (
        <>
          <p>
            Tippe auf die Karte, um deinen Punkt zu setzen. Wir speichern nur diesen Punkt, nie
            deinen aktuellen Standort.
          </p>
          <HomeAreaMap
            point={form.point}
            radiusKm={form.radiusKm}
            fallbackCenter={fallbackCenter}
            onPick={(point) => change({ point })}
          />
          <HomeAreaFields form={form} onChange={change} />
          <button
            type="button"
            onClick={() => form.point && save(form, form.point)}
            disabled={busy || !form.point || form.types.size === 0}
          >
            {form.on ? 'Änderungen speichern' : 'Heimatbereich einschalten'}
          </button>
          {form.on && (
            <button type="button" onClick={turnOff} disabled={busy}>
              Heimatbereich ausschalten
            </button>
          )}
        </>
      )}
      {message && <p>{message}</p>}
      {error && <p className="form-error">{error}</p>}
      <button type="button" className="link" onClick={onClose}>
        Schließen
      </button>
    </Dialog>
  )
}

function HomeAreaFields({ form, onChange }: { form: Form; onChange: (next: Partial<Form>) => void }) {
  function toggle(type: ActivityType) {
    const types = new Set(form.types)
    if (types.has(type)) types.delete(type)
    else types.add(type)
    onChange({ types })
  }

  return (
    <>
      <label>
        Radius: {form.radiusKm} km
        <input
          type="range"
          min={1}
          max={20}
          step={1}
          value={form.radiusKm}
          onChange={(event) => onChange({ radiusKm: Number(event.target.value) })}
        />
      </label>
      <fieldset className="home-area-types">
        <legend>Sportarten</legend>
        {ACTIVITY_TYPES.map((type) => (
          <label key={type} className="checkbox">
            <input type="checkbox" checked={form.types.has(type)} onChange={() => toggle(type)} />
            {ACTIVITIES[type].emoji} {ACTIVITIES[type].label}
          </label>
        ))}
      </fieldset>
      {form.types.size === 0 && <p className="form-error">Wähle mindestens eine Sportart.</p>}
    </>
  )
}
