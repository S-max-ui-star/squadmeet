import { useEffect, useState } from 'react'
import Dialog from '../Dialog'
import { fetchMyMeetups, type MyMeetup } from '../api/meetups'
import { activityOf } from './activities'
import { slot } from './meetupTime'
import { groupSeries, type Row } from './seriesGroups'

type Props = { token: string; onOpenPlace: (id: number) => void; onClose: () => void }

/** "Meine Treffen" (SCRUM-102): the user's coming and running Meetups, so they do not plan a
 * second one by mistake. A tap opens the Place, like a tap on a Notification (SCRUM-90). */
export default function MyMeetupsDialog({ token, onOpenPlace, onClose }: Props) {
  const [meetups, setMeetups] = useState<MyMeetup[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMyMeetups(token)
      .then(setMeetups)
      .catch((err: Error) => setError(err.message))
  }, [token])

  const hosted = groupSeries(meetups?.filter((meetup) => meetup.hosting) ?? [])
  const joined = groupSeries(meetups?.filter((meetup) => !meetup.hosting) ?? [])

  return (
    <Dialog title="Meine Treffen" className="my-meetups" onClose={onClose}>
      {error && <p className="form-error">{error}</p>}
      {meetups === null && !error && <p>Lädt …</p>}
      {meetups?.length === 0 && <p>Keine anstehenden Treffen.</p>}
      <MeetupSection title="Gastgeber" rows={hosted} onOpenPlace={onOpenPlace} />
      <MeetupSection title="Dabei" rows={joined} onOpenPlace={onOpenPlace} />
    </Dialog>
  )
}

type SectionProps = { title: string; rows: Row<MyMeetup>[]; onOpenPlace: (id: number) => void }

function MeetupSection({ title, rows, onOpenPlace }: SectionProps) {
  if (rows.length === 0) return null
  return (
    <section>
      <h3>{title}</h3>
      <ul className="my-meetup-list">
        {rows.map(({ meetup, laterOfSeries }) => (
          <li key={meetup.id}>
            <button type="button" onClick={() => onOpenPlace(meetup.place.id)}>
              <MeetupLine meetup={meetup} later={laterOfSeries.length} />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}

function MeetupLine({ meetup, later }: { meetup: MyMeetup; later: number }) {
  const activity = activityOf(meetup.place.activity_type)
  return (
    <>
      <strong>
        {activity.emoji} {meetup.place.name}
      </strong>
      <span>
        {slot(meetup)} · {meetup.people} {meetup.people === 1 ? 'Person' : 'Personen'}
      </span>
      {meetup.cancelled && <span className="cancelled-tag">Abgesagt</span>}
      {later > 0 && <span className="hint">+ {later} weitere Termine</span>}
    </>
  )
}
