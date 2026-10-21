import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { loadToken, type User } from '../api/auth'
import { fetchMeetups, type Meetup } from '../api/meetups'
import { onMeetupChange } from '../api/live'
import MeetupCard from './MeetupCard'
import MeetupCreateForm from './MeetupCreateForm'
import SeriesJoin from './SeriesJoin'
import { groupSeries } from './seriesGroups'
import { useLatestRequest } from './useLatestRequest'
import { usePlaceReloads } from './usePlaceReloads'

type Props = {
  placeId: number
  user: User | null
  onLoginNeeded: () => void
  // Called after a Meetup was created, moved or ended, so the map can show the new state.
  onChanged: () => void
  // A reported Place under Admin review: the Meetups only show (SCRUM-158).
  readOnly?: boolean
}

// A Push tap carries the exact Meetup as a fragment. The list loads asynchronously, so scroll
// once after that card exists, but do not pull the user back on every reload (SCRUM-155).
function MeetupDeepLink({ meetups, placeId }: { meetups: Meetup[]; placeId: number }) {
  const scrolled = useRef<string | null>(null)
  useEffect(() => {
    const match = /^#treffen-(\d+)$/.exec(window.location.hash)
    if (!match || !meetups.some((meetup) => meetup.id === Number(match[1]))) return
    const key = `${placeId}:${window.location.hash}`
    if (scrolled.current === key) return
    const frame = requestAnimationFrame(() => {
      document.getElementById(`treffen-${match[1]}`)?.scrollIntoView({ block: 'center' })
      scrolled.current = key
    })
    return () => cancelAnimationFrame(frame)
  }, [meetups, placeId])
  return null
}

// The backend refuses every Meetup action at a Place under review: no card offers one, and
// nobody joins a Series there (SCRUM-158).
function reviewView(meetups: Meetup[] | null, user: User | null, readOnly: boolean) {
  if (!readOnly) return { shown: meetups, seriesJoiner: user }
  return { shown: meetups && meetups.map((meetup) => ({ ...meetup, actions: [] })), seriesJoiner: null }
}

type StartProps = {
  readOnly: boolean
  creating: 'now' | 'later' | null
  placeId: number
  busy: boolean
  run: (action: (token: string) => Promise<unknown>) => Promise<boolean>
  onStart: (kind: 'now' | 'later') => void
  onClose: () => void
}

// "Ich bin jetzt hier" and "Später treffen", or the form of the chosen one.
function MeetupStart({ readOnly, creating, placeId, busy, run, onStart, onClose }: StartProps) {
  if (readOnly) return null
  if (creating) {
    return <MeetupCreateForm key={creating} kind={creating} placeId={placeId} busy={busy} run={run} onClose={onClose} />
  }
  return (
    <>
      <button type="button" className="now-button" onClick={() => onStart('now')}>📍 Ich bin jetzt hier</button>
      <button type="button" className="later-button" onClick={() => onStart('later')}>🗓 Später treffen</button>
    </>
  )
}

// Meetup orchestration stays here; focused components own the creation form and each card
// (SCRUM-154). Server-provided actions remain the authority for every lifecycle control.
export default function PlaceMeetups({ placeId, user, onLoginNeeded, onChanged, readOnly = false }: Props) {
  const [meetups, setMeetups] = useState<Meetup[] | null>(null)
  const [loadedFor, setLoadedFor] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState<'now' | 'later' | null>(null)
  const [moving, setMoving] = useState<{ id: number; startsAt: string } | null>(null)
  const [joining, setJoining] = useState<{ id: number; partySize: number } | null>(null)
  const [person, setPerson] = useState<{ meetupId: number; nickname: string } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [now, setNow] = useState(() => new Date())
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const { run: latest } = useLatestRequest()
  const viewerKey = `${placeId}:${user?.id ?? 'guest'}`
  const loaded = loadedFor === viewerKey ? meetups : null
  const { shown: visibleMeetups, seriesJoiner } = reviewView(loaded, user, readOnly)

  const reload = useCallback(() => {
    setLoading(true)
    setError(null)
    latest(
      (signal) => fetchMeetups(placeId, user ? loadToken() : null, signal),
      (found) => {
        setMeetups(found)
        setLoadedFor(viewerKey)
        setNow(new Date())
        setLoading(false)
      },
      (err) => {
        setError(err.message)
        setLoading(false)
      },
    )
  }, [placeId, user, viewerKey, latest])

  usePlaceReloads(reload, placeId, onMeetupChange)

  async function run(action: (token: string) => Promise<unknown>): Promise<boolean> {
    if (busyRef.current) return false
    const token = loadToken()
    if (!token) {
      onLoginNeeded()
      return false
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      await action(token)
      setCreating(null)
      setMoving(null)
      setJoining(null)
      setPerson(null)
      reload()
      onChanged()
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function startCreating(kind: 'now' | 'later') {
    if (!user) {
      onLoginNeeded()
      return
    }
    setCreating(kind)
  }

  function toggleSeries(seriesId: number) {
    setExpanded((current) => {
      const next = new Set(current)
      if (next.has(seriesId)) next.delete(seriesId)
      else next.add(seriesId)
      return next
    })
  }

  const offeredIds = new Set((visibleMeetups ?? []).map((meetup) => meetup.move_offer?.meetup_id))
  const card = (meetup: Meetup, laterCount: number, cancellableSeriesId: number | null = null) => (
    <MeetupCard
      key={meetup.id}
      meetup={meetup}
      user={user}
      laterCount={laterCount}
      offered={offeredIds.has(meetup.id)}
      busy={busy}
      now={now}
      joining={joining}
      moving={moving}
      person={person}
      expanded={expanded.has(meetup.series_id ?? -1)}
      cancellableSeriesId={cancellableSeriesId}
      setJoining={setJoining}
      setMoving={setMoving}
      setPerson={setPerson}
      setNotice={setNotice}
      onToggleExpanded={() => toggleSeries(meetup.series_id!)}
      onLoginNeeded={onLoginNeeded}
      run={run}
    />
  )

  return (
    <div className="place-meetups">
      <MeetupDeepLink meetups={loaded ?? []} placeId={placeId} />
      <MeetupStart
        readOnly={readOnly}
        creating={creating}
        placeId={placeId}
        busy={busy}
        run={run}
        onStart={startCreating}
        onClose={() => setCreating(null)}
      />

      {error && <p className="form-error">{error}</p>}
      {notice && !error && <p className="hint">{notice}</p>}

      <h3>Treffen hier</h3>
      {visibleMeetups === null && loading && <p className="hint">Treffen werden geladen …</p>}
      {visibleMeetups?.length === 0 && !error && <p className="hint">Gerade ist niemand hier.</p>}
      <ul className="meetup-list">
        {groupSeries(visibleMeetups ?? []).map(({ meetup, laterOfSeries }) => {
          const dates = [meetup, ...laterOfSeries]
          const cancellable = dates.find((date) => date.actions.includes('cancel_series'))
          const open = expanded.has(meetup.series_id ?? -1)
          return (
            <Fragment key={meetup.id}>
              {card(meetup, laterOfSeries.length, cancellable?.series_id ?? null)}
              {open && seriesJoiner && meetup.host?.id !== seriesJoiner.id && (
                <li className="series-join-item">
                  <SeriesJoin dates={dates} onDone={() => { reload(); onChanged() }} />
                </li>
              )}
              {open && laterOfSeries.map((later) => card(later, 0))}
            </Fragment>
          )
        })}
      </ul>
    </div>
  )
}
