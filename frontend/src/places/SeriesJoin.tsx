import { useRef, useState } from 'react'
import { loadToken } from '../api/auth'
import { joinMeetup, type Meetup } from '../api/meetups'
import { slot } from './meetupTime'
import PartySizeStepper from './PartySizeStepper'

type Props = {
  // The dates of one Series in the open overview "Alle Termine", by start.
  dates: Meetup[]
  // After the Joins: the list and the map load again.
  onDone: () => void
}

// Already in: the Host, or a Join ("leave" is offered).
const isIn = (date: Meetup) => date.actions.includes('leave')
const canJoin = (date: Meetup) => date.actions.includes('join')

// Join several dates of a weekly Series at once (SCRUM-81). Each date is one Join, so a date
// that fails (the overlap limit, a Block) does not stop the others; the user sees which failed.
export default function SeriesJoin({ dates, onDone }: Props) {
  const [picked, setPicked] = useState<Set<number>>(new Set())
  const [partySize, setPartySize] = useState(1)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [result, setResult] = useState<{ joined: number; failed: string[] } | null>(null)
  const open = dates.filter(canJoin)

  async function join(targets: Meetup[]) {
    if (busyRef.current) return
    const token = loadToken()
    if (!token || targets.length === 0) return
    busyRef.current = true
    setBusy(true)
    let joined = 0
    const failed: string[] = []
    for (const date of targets) {
      try {
        await joinMeetup(token, date.id, partySize)
        joined += 1
      } catch (err) {
        failed.push(`${slot(date)}: ${(err as Error).message}`)
      }
    }
    try {
      setResult({ joined, failed })
      setPicked(new Set())
      onDone()
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }

  function toggle(id: number) {
    const next = new Set(picked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setPicked(next)
  }

  return (
    <div className="series-join" role="group" aria-label="Mehreren Terminen beitreten">
      <ul>
        {dates.map((date) => (
          <li key={date.id}>
            <label>
              <input
                type="checkbox"
                value={date.id}
                checked={isIn(date) || picked.has(date.id)}
                disabled={busy || !canJoin(date)}
                onChange={() => toggle(date.id)}
              />{' '}
              {slot(date)}
            </label>
          </li>
        ))}
      </ul>
      {open.length > 0 && (
        <>
          <PartySizeStepper value={partySize} onChange={setPartySize} />
          <div className="button-row">
            <button
              type="button"
              disabled={busy || picked.size === 0}
              onClick={() => join(open.filter((date) => picked.has(date.id)))}
            >
              Ausgewählten beitreten
            </button>
            <button type="button" disabled={busy} onClick={() => join(open)}>
              Allen beitreten
            </button>
          </div>
        </>
      )}
      {result && result.joined > 0 && (
        <p className="hint">Beigetreten: {result.joined === 1 ? '1 Termin' : `${result.joined} Termine`}.</p>
      )}
      {result && result.failed.length > 0 && (
        <div className="form-error">
          Nicht beigetreten:
          <ul>
            {result.failed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
