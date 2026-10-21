import { useEffect, useRef, useState } from 'react'
import { searchPlaces, type PlaceSearchHit } from '../api/places'

type Props = {
  onPick: (hit: PlaceSearchHit) => void
  dismissRequest: number
}

function SearchResults({
  hits,
  error,
  onPick,
}: {
  hits: PlaceSearchHit[]
  error: string | null
  onPick: (hit: PlaceSearchHit) => void
}) {
  return (
    <div className="search-results" aria-live="polite">
      {error && <p className="form-error">Suche fehlgeschlagen. Bitte versuche es erneut.</p>}
      {!error && hits.length === 0 && <p>Keine Treffer.</p>}
      {hits.length > 0 && (
        <ul>
          {hits.map((hit, index) => (
            <li key={`${hit.kind}-${hit.place_id ?? `${hit.lat}-${hit.lon}`}-${index}`}>
              <button type="button" onClick={() => onPick(hit)}>
                <span aria-hidden="true">{hit.kind === 'place' ? '📍' : '⌖'}</span>
                <span>
                  {hit.label}
                  {hit.kind === 'place' && <small>SquadMeet-Platz</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {!error && (
        <small className="search-attribution">
          Suche ©{' '}
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
            OpenStreetMap-Mitwirkende
          </a>{' '}
          · Nominatim
        </small>
      )}
    </div>
  )
}

export default function PlaceSearch({ onPick, dismissRequest }: Props) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<PlaceSearchHit[]>([])
  const [searched, setSearched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultDismissRequest, setResultDismissRequest] = useState(dismissRequest)
  const requestNumber = useRef(0)
  const pending = useRef(false)
  const searchRequest = useRef<AbortController | null>(null)

  useEffect(() => () => searchRequest.current?.abort(), [])

  function closeResults() {
    requestNumber.current += 1
    searchRequest.current?.abort()
    searchRequest.current = null
    pending.current = false
    setHits([])
    setSearched(false)
    setBusy(false)
    setError(null)
  }

  async function submit() {
    const trimmed = query.trim()
    if (!trimmed || pending.current) return
    pending.current = true
    const currentRequest = ++requestNumber.current
    const request = new AbortController()
    searchRequest.current = request
    setBusy(true)
    setError(null)
    try {
      const answer = await searchPlaces(trimmed, request.signal)
      if (request.signal.aborted || currentRequest !== requestNumber.current) return
      setHits(answer)
      setSearched(true)
      setResultDismissRequest(dismissRequest)
    } catch (caught) {
      if (request.signal.aborted || currentRequest !== requestNumber.current) return
      setHits([])
      setSearched(false)
      setError((caught as Error).message)
      setResultDismissRequest(dismissRequest)
    } finally {
      if (currentRequest === requestNumber.current) {
        pending.current = false
        searchRequest.current = null
        setBusy(false)
      }
    }
  }

  function pick(hit: PlaceSearchHit) {
    closeResults()
    onPick(hit)
  }

  return (
    <div className="place-search">
      <form
        role="search"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <label className="visually-hidden" htmlFor="place-search-input">
          Platz oder Adresse suchen
        </label>
        <input
          id="place-search-input"
          type="search"
          value={query}
          placeholder="Platz oder Adresse suchen"
          onChange={(event) => {
            setQuery(event.target.value)
            closeResults()
          }}
        />
        <button type="submit" disabled={busy || !query.trim()} aria-label="Suchen">
          {busy ? '…' : '⌕'}
        </button>
      </form>

      {resultDismissRequest === dismissRequest && (searched || error) && (
        <SearchResults hits={hits} error={error} onPick={pick} />
      )}
    </div>
  )
}
