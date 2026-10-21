import { useCallback, useEffect, useRef, useState } from 'react'
import { loadToken, type User } from '../api/auth'
import { fetchPhotos, MAX_PHOTO_BYTES, PHOTO_ACCEPT, photoTypeAllowed, uploadPhoto, type Photo } from '../api/photos'
import { whileVisible } from '../whileVisible'
import RetryError from './RetryError'
import { useLatestRequest } from './useLatestRequest'

// The signed links live 15 minutes (backend/app/photos.py): new ones come well before that,
// and at once when the page comes back to the front (SCRUM-161).
const PHOTO_REFRESH_MS = 10 * 60_000

type Props = {
  placeId: number
  user: User | null
  onLoginNeeded: () => void
  // A reported Place under Admin review: the Photos only show, no upload (SCRUM-158).
  readOnly?: boolean
}

type UploadProps = Pick<Props, 'placeId' | 'user' | 'onLoginNeeded'>

// "Foto hinzufügen" from the camera or the gallery (the phone offers both for a file input).
function PhotoUpload({ placeId, user, onLoginNeeded }: UploadProps) {
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)

  function choose() {
    if (!user) {
      onLoginNeeded()
      return
    }
    setError(null)
    input.current?.click()
  }

  async function send(file: File) {
    if (!photoTypeAllowed(file)) {
      setError('Nur JPEG, PNG oder WebP')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Das Foto ist größer als 10 MB')
      return
    }
    const token = loadToken()
    if (!token) return
    setBusy(true)
    setError(null)
    try {
      await uploadPhoto(token, placeId, file)
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {sent && <p>Danke! Dein Foto erscheint, sobald ein Admin es freigegeben hat.</p>}
      <p className="hint">Bitte keine Personen auf den Fotos. Standortdaten im Foto werden entfernt.</p>
      <button type="button" className="link" disabled={busy} onClick={choose}>
        {busy ? 'Lädt hoch …' : 'Foto hinzufügen'}
      </button>
      <input
        ref={input}
        type="file"
        accept={PHOTO_ACCEPT}
        hidden
        aria-label="Foto auswählen"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // The same file can be chosen again after an error.
          event.target.value = ''
          if (file) void send(file)
        }}
      />
      {error && <p className="form-error">{error}</p>}
    </>
  )
}

/** "Fotos" in the Place detail (SCRUM-42): the approved Photos and the upload. A new Photo waits
 * for an Admin, so it does not show here at once. The parent gives it key={placeId}. */
export default function PlacePhotos({ placeId, user, onLoginNeeded, readOnly = false }: Props) {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  // A failed load keeps the Photos shown so far; "Erneut laden" tries again.
  const [loadError, setLoadError] = useState<string | null>(null)
  const { run } = useLatestRequest()

  const reload = useCallback(() => {
    run(
      (signal) => fetchPhotos(placeId, loadToken(), signal),
      (found) => {
        setPhotos(found)
        setLoadError(null)
      },
      (err) => setLoadError(err.message),
    )
  }, [placeId, run])

  useEffect(() => {
    reload()
    return whileVisible(reload, PHOTO_REFRESH_MS)
  }, [reload])

  return (
    <div className="place-photos">
      <h3>Fotos</h3>
      {photos?.length === 0 && <p className="hint">Noch keine Fotos.</p>}
      {loadError && (
        <RetryError message={photos ? 'Die Fotos konnten nicht neu geladen werden.' : loadError} onRetry={reload} />
      )}
      {photos && photos.length > 0 && (
        <ul className="place-photo-list">
          {photos.map((photo) => (
            <li key={photo.id}>
              <a href={photo.url} target="_blank" rel="noreferrer">
                <img src={photo.url} width={photo.width} height={photo.height} loading="lazy" alt="Foto des Platzes" />
              </a>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && <PhotoUpload placeId={placeId} user={user} onLoginNeeded={onLoginNeeded} />}
    </div>
  )
}
