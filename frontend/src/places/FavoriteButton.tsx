import { useEffect, useState } from 'react'
import { addFavorite, fetchFavorite, removeFavorite, type Favorite } from '../api/favorites'

type Props = {
  placeId: number
  token: string | null
  onLoginNeeded: () => void
}

export default function FavoriteButton({ placeId, token, onLoginNeeded }: Props) {
  const [favorite, setFavorite] = useState<Favorite | null>(null)
  const [loaded, setLoaded] = useState(!token)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let current = true
    if (token) {
      fetchFavorite(token, placeId)
        .then((found) => {
          if (current) setFavorite(found)
        })
        .catch((err: Error) => current && setError(err.message))
        .finally(() => current && setLoaded(true))
    }
    return () => {
      current = false
    }
  }, [placeId, token])

  async function toggle() {
    if (!token) {
      onLoginNeeded()
      return
    }
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      if (favorite) {
        await removeFavorite(token, placeId)
        setFavorite(null)
      } else {
        setFavorite(await addFavorite(token, placeId))
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    // One of the side actions of the Place detail (SCRUM-176); hint and error go below the row.
    <>
      <button
        type="button"
        className="place-action"
        aria-label={favorite ? 'Favorit entfernen' : 'Als Favorit merken'}
        aria-pressed={favorite !== null}
        disabled={busy || !loaded}
        onClick={toggle}
      >
        <span className="place-action-icon" aria-hidden="true">{favorite ? '★' : '☆'}</span>
        <span className="place-action-label">Favorit</span>
      </button>
      {favorite && <span className="hint place-action-note">Zeitfenster kannst du unter Konto → Favoriten festlegen.</span>}
      {error && <span className="form-error place-action-note">{error}</span>}
    </>
  )
}
