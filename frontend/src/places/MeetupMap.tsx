import type { Meetup, TimeSpan } from '../api/meetups'
import { AVATARS } from '../auth/avatars'
import type { Place } from '../api/places'
import { slot } from './meetupTime'
import TimeFilter from './TimeFilter'

type Props = {
  span: TimeSpan | null
  meetups: Meetup[]
  places: Place[]
  onSpanChange: (span: TimeSpan | null) => void
  onOpenPlace: (placeId: number) => void
  showList?: boolean
  loading?: boolean
  error?: boolean
}

function ContactSummary({ contacts }: { contacts: NonNullable<Meetup['contacts']> }) {
  if (contacts.length === 0) return null
  const first = `${AVATARS[contacts[0].avatar]?.emoji ?? ''} ${contacts[0].nickname}`.trim()
  let text = `${first} ist dabei`
  if (contacts.length === 2) {
    const second = `${AVATARS[contacts[1].avatar]?.emoji ?? ''} ${contacts[1].nickname}`.trim()
    text = `${first} und ${second} sind dabei`
  } else if (contacts.length > 2) {
    text = `${first} und ${contacts.length - 1} weitere`
  }
  return <span className="map-meetup-meta map-meetup-contacts">{text}</span>
}

export default function MeetupMap({
  span,
  meetups,
  places,
  onSpanChange,
  onOpenPlace,
  showList = true,
  loading = false,
  error = false,
}: Props) {
  const placesById = new Map(places.map((place) => [place.id, place]))
  const visibleMeetups = meetups.filter((meetup) => placesById.has(meetup.place_id))

  return (
    <>
      <TimeFilter span={span} onSpanChange={onSpanChange} />
      {span && showList && (
        <section className="map-meetup-list" aria-label="Treffen im Kartenausschnitt">
          <h2>Treffen</h2>
          {loading ? (
            <p role="status">Treffen werden geladen …</p>
          ) : error ? (
            <p>Treffen konnten nicht geladen werden.</p>
          ) : visibleMeetups.length === 0 ? (
            <p>Keine Treffen in diesem Kartenausschnitt.</p>
          ) : (
            <ul>
              {visibleMeetups.map((meetup) => {
                const place = placesById.get(meetup.place_id)!
                return (
                  <li key={meetup.id} className="map-meetup-item">
                    <button className="map-meetup-button" type="button" onClick={() => onOpenPlace(meetup.place_id)}>
                      <strong>{place.name}</strong>
                      <span className="map-meetup-meta">{slot(meetup)}</span>
                      <span className="map-meetup-meta">{meetup.people} {meetup.people === 1 ? 'Person' : 'Personen'}</span>
                      {meetup.contacts && <ContactSummary contacts={meetup.contacts} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      )}
    </>
  )
}
