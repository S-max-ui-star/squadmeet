import { useCallback, useEffect, useState, type FormEvent } from 'react'
import {
  addFavoriteRule,
  editFavoriteRule,
  fetchFavorites,
  removeFavorite,
  removeFavoriteRule,
  type Favorite,
  type FavoriteTimeRule,
} from '../api/favorites'
import Dialog from '../Dialog'

const DAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']
const dayNames = (days: number[]) => days.map((day) => DAYS[day]).join(', ')
const shortTime = (value: string) => value.slice(0, 5)

type Props = { token: string; onOpenPlace: (id: number) => void; onClose: () => void }

export default function FavoritesDialog({ token, onOpenPlace, onClose }: Props) {
  const [favorites, setFavorites] = useState<Favorite[] | null>(null)
  const [editing, setEditing] = useState<{ favoriteId: number; rule?: FavoriteTimeRule } | null>(null)
  const [weekdays, setWeekdays] = useState<number[]>([])
  const [start, setStart] = useState('17:00')
  const [end, setEnd] = useState('21:00')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const reload = useCallback(() => {
    return fetchFavorites(token)
      .then(setFavorites)
      .catch((err: Error) => setError(err.message))
  }, [token])

  useEffect(() => {
    void reload()
  }, [reload])

  function begin(favoriteId: number, rule?: FavoriteTimeRule) {
    setEditing({ favoriteId, rule })
    setWeekdays(rule?.weekdays ?? [])
    setStart(rule ? shortTime(rule.start) : '17:00')
    setEnd(rule ? shortTime(rule.end) : '21:00')
    setError(null)
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (!editing) return
    if (weekdays.length === 0) {
      setError('Wähle mindestens einen Wochentag.')
      return
    }
    if (start >= end) {
      setError('Das Zeitfenster muss am selben Tag enden.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const body = { weekdays, start, end }
      if (editing.rule) {
        await editFavoriteRule(token, editing.favoriteId, editing.rule.id, body)
      } else {
        await addFavoriteRule(token, editing.favoriteId, body)
      }
      setEditing(null)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removePlace(favorite: Favorite) {
    setBusy(true)
    setError(null)
    try {
      await removeFavorite(token, favorite.place.id)
      if (editing?.favoriteId === favorite.id) setEditing(null)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function removeRule(favoriteId: number, ruleId: number) {
    setBusy(true)
    setError(null)
    try {
      await removeFavoriteRule(token, favoriteId, ruleId)
      await reload()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog title="Favoriten" className="favorites-dialog" onClose={onClose}>
      <p className="hint">
        Ohne Zeitfenster erhältst du immer eine Benachrichtigung. Mit Zeitfenstern nur, wenn ein Treffen darin beginnt.
      </p>
      {error && <p className="form-error">{error}</p>}
      {favorites === null && !error && <p>Lädt …</p>}
      {favorites?.length === 0 && <p>Noch keine Favoriten gespeichert.</p>}
      {favorites?.map((favorite) => (
        <section className="favorite-card" key={favorite.id}>
          <h3>{favorite.place.name}</h3>
          {favorite.place.address && <p>{favorite.place.address}</p>}
          <div className="button-row">
            <button type="button" onClick={() => onOpenPlace(favorite.place.id)}>Auf Karte</button>
            <button type="button" disabled={busy} onClick={() => removePlace(favorite)}>Entfernen</button>
          </div>
          {favorite.rules.length === 0 && <p className="hint">Immer aktiv</p>}
          <ul className="favorite-rules">
            {favorite.rules.map((rule) => (
              <li key={rule.id}>
                <span>{dayNames(rule.weekdays)}, {shortTime(rule.start)}–{shortTime(rule.end)} Uhr</span>
                <button type="button" disabled={busy} onClick={() => begin(favorite.id, rule)}>Bearbeiten</button>
                <button type="button" disabled={busy} onClick={() => removeRule(favorite.id, rule.id)}>Löschen</button>
              </li>
            ))}
          </ul>
          <button type="button" disabled={busy} onClick={() => begin(favorite.id)}>＋ Zeitfenster</button>
        </section>
      ))}
      {editing && (
        <form className="favorite-rule-form" onSubmit={save}>
          <h3>{editing.rule ? 'Zeitfenster bearbeiten' : 'Zeitfenster hinzufügen'}</h3>
          <fieldset>
            <legend>Wochentage</legend>
            {DAYS.map((day, index) => (
              <label className="checkbox" key={day}>
                <input
                  type="checkbox"
                  checked={weekdays.includes(index)}
                  onChange={(event) => setWeekdays((current) =>
                    event.target.checked ? [...current, index].sort() : current.filter((item) => item !== index),
                  )}
                />
                {day}
              </label>
            ))}
          </fieldset>
          <div className="favorite-times">
            <label>Von<input type="time" value={start} onChange={(event) => setStart(event.target.value)} /></label>
            <label>Bis<input type="time" value={end} onChange={(event) => setEnd(event.target.value)} /></label>
          </div>
          <div className="button-row">
            <button type="submit" disabled={busy}>Speichern</button>
            <button type="button" disabled={busy} onClick={() => setEditing(null)}>Abbrechen</button>
          </div>
        </form>
      )}
      <button type="button" className="link" onClick={onClose}>Schließen</button>
    </Dialog>
  )
}
