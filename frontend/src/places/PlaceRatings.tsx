import { useCallback, useEffect, useState } from 'react'
import type { User } from '../api/auth'
import { loadToken } from '../api/auth'
import {
  fetchMyRating,
  fetchRatingSummary,
  fetchReasons,
  saveRating,
  voteOnIssue,
  type Issue,
  type Rating,
  type RatingSummary,
  type Reason,
  type ReasonCount,
} from '../api/ratings'
import { onRatingChange } from '../api/live'
import type { Place } from '../api/places'
import { findCityReport, mailtoLink, placeText, telLink } from './cityReport'
import { usePlaceReloads } from './usePlaceReloads'
import PlaceRatingList from './PlaceRatingList'

type Props = {
  placeId: number
  // For the City report (SCRUM-55): where the Place is; null while it loads.
  place?: Pick<Place, 'name' | 'lat' | 'lon' | 'address'> | null
  user: User | null
  onLoginNeeded: () => void
}

type CityReportProps = {
  place: Pick<Place, 'name' | 'lat' | 'lon' | 'address'>
  // The Condition names something the city must fix: the box stands out.
  highlighted: boolean
  // Right after the user saved a Rating that names such an issue.
  asked: boolean
}

// "Meldung an die Stadt" (SCRUM-55): the city's online defect report, its phone line, and the
// office for green spaces and playgrounds with e-mail and phone, plus the place to copy.
// The app sends nothing; the links open the user's browser, mail or phone app.
// A button that folds out, closed at first (SCRUM-82); it opens by itself when asked.
// Copying the Place: done, or not possible (no Clipboard API, or refused): then the text shows
// in a field to copy by hand (SCRUM-163).
type CopyState = 'idle' | 'copied' | 'failed'

function CityReportBox({ place, highlighted, asked }: CityReportProps) {
  const [copied, setCopied] = useState<CopyState>('idle')
  // null until the user taps: then it follows `asked`.
  const [toggled, setToggled] = useState<boolean | null>(null)
  const open = toggled ?? asked
  const report = findCityReport(place.lat, place.lon)
  if (!report) return null
  return (
    <div className={highlighted ? 'city-report highlighted' : 'city-report'}>
      <button type="button" className="city-report-toggle" aria-expanded={open} onClick={() => setToggled(!open)}>
        📣 Willst du das der Stadt melden? {open ? '▴' : '▾'}
      </button>
      {open && <CityReportLinks report={report} place={place} copied={copied} onCopied={setCopied} />}
    </div>
  )
}

type LinksProps = {
  report: NonNullable<ReturnType<typeof findCityReport>>
  place: CityReportProps['place']
  copied: CopyState
  onCopied: (copied: CopyState) => void
}

function CityReportLinks({ report, place, copied, onCopied }: LinksProps) {
  const { office } = report
  const text = placeText(place.name, place.lat, place.lon, place.address ?? null)
  function copy() {
    if (!navigator.clipboard?.writeText) {
      onCopied('failed')
      return
    }
    navigator.clipboard
      .writeText(text)
      .then(() => onCopied('copied'))
      .catch(() => onCopied('failed'))
  }
  return (
    <>
      <a href={report.portal.url} target="_blank" rel="noreferrer">
        📣 Meldung an die Stadt: {report.portal.name}
      </a>
      {report.phone && (
        <span>
          ☎️ <a href={telLink(report.phone.number)}>{report.phone.number}</a> ({report.phone.note})
        </span>
      )}
      <span className="city-report-office">Zuständig für Grünanlagen und Spielplätze: {office.name}</span>
      <span>
        ✉️{' '}
        <a href={mailtoLink(office.email, place.name, place.lat, place.lon, place.address ?? null)}>{office.email}</a>
      </span>
      {office.phone && (
        <span>
          ☎️ <a href={telLink(office.phone.number)}>{office.phone.number}</a> ({office.phone.note})
        </span>
      )}
      <button type="button" className="link-button" onClick={copy}>
        {copied === 'copied' ? 'Ort kopiert ✓' : 'Ort für die Meldung kopieren'}
      </button>
      {copied === 'failed' && (
        <label className="city-report-copy">
          Kopieren ging nicht. Markiere den Text und kopiere ihn selbst:
          <textarea readOnly rows={4} value={text} onFocus={(event) => event.target.select()} />
        </label>
      )}
    </>
  )
}

const STARS = [1, 2, 3, 4, 5]

const decimal = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function ratings(n: number): string {
  return n === 1 ? '1 Bewertung' : `${n} Bewertungen`
}

function starText(stars: number): string {
  return '★'.repeat(stars) + '☆'.repeat(5 - stars)
}

const fixedDay = new Intl.DateTimeFormat('de-DE', { day: '2-digit', month: '2-digit' })

// A Reason of an issue that users said is fixed is crossed out; the Ratings stay (SCRUM-99).
function ReasonChips({ reasons }: { reasons: ReasonCount[] }) {
  return (
    <ul className="reason-chips">
      {reasons.map((reason) =>
        reason.fixed_at ? (
          <li key={`${reason.key}-fixed`} className="fixed">
            <del>
              {reason.label} <span className="reason-count">{reason.count}</span>
            </del>{' '}
            behoben am {fixedDay.format(new Date(reason.fixed_at))}.
          </li>
        ) : (
          <li key={reason.key} className={reason.positive ? 'good' : 'bad'}>
            {reason.label} <span className="reason-count">{reason.count}</span>
          </li>
        ),
      )}
    </ul>
  )
}

// Votes on one side that confirm an issue or end it (VOTES_NEEDED in backend/app/ratings.py).
const VOTES_NEEDED = 3

type CheckProps = {
  issue: Issue
  voted: boolean
  busy: boolean
  onVote: (stillThere: boolean) => void
}

// "Schon behoben?" (SCRUM-82): "Ja, behoben" for every issue, at any time; "Nein, noch nicht
// behoben" once nobody confirmed it for two months.
function IssueCheck({ issue, voted, busy, onVote }: CheckProps) {
  return (
    <div className="issue-check">
      {issue.needs_check ? (
        <span className="hint">
          Seit über 2 Monaten nicht bestätigt. Noch so: {issue.still_there_votes}/{VOTES_NEEDED} ·
          Behoben: {issue.fixed_votes}/{VOTES_NEEDED}
        </span>
      ) : (
        issue.fixed_votes > 0 && (
          <span className="hint">
            Behoben: {issue.fixed_votes}/{VOTES_NEEDED}
          </span>
        )
      )}
      {voted ? (
        <span className="hint">Danke für deine Antwort!</span>
      ) : (
        <span className="issue-check-buttons">
          Schon behoben?
          <button type="button" disabled={busy} onClick={() => onVote(false)}>
            Ja, behoben
          </button>
          {/* "Still there" counts only once nobody confirmed it for two months (backend). */}
          {issue.needs_check && (
            <button type="button" disabled={busy} onClick={() => onVote(true)}>
              Nein, noch nicht behoben
            </button>
          )}
        </span>
      )}
    </div>
  )
}

type ConditionProps = {
  summary: RatingSummary
  voted: Set<string>
  busy: boolean
  onVote: (issue: Issue, stillThere: boolean) => void
}

function ConditionLine({ summary, voted, busy, onVote }: ConditionProps) {
  const { state, issues } = summary.condition
  if (state === 'unknown') {
    return <p className="hint">Zustand: noch keine aktuellen Bewertungen.</p>
  }
  if (state === 'good') {
    return <p className="condition good">✅ Zustand: in Ordnung</p>
  }
  return (
    <div className="condition issues">
      <p>⚠️ Zustand: Mängel gemeldet</p>
      <ul>
        {issues.map((issue) => (
          <li key={issue.key}>
            {issue.label} ({issue.count}×)
            <IssueCheck
              issue={issue}
              voted={voted.has(issue.key)}
              busy={busy}
              onVote={(stillThere) => onVote(issue, stillThere)}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}

type RatingEditorProps = {
  stars: number
  chosen: Set<string>
  reasons: Reason[] | null
  busy: boolean
  missing: string | null
  onStars: (stars: number) => void
  onToggle: (key: string) => void
  onSubmit: () => void
  onCancel: () => void
}

function RatingEditor({
  stars,
  chosen,
  reasons,
  busy,
  missing,
  onStars,
  onToggle,
  onSubmit,
  onCancel,
}: RatingEditorProps) {
  function reasonGroup(title: string, positive: boolean) {
    const group = (reasons ?? []).filter((reason) => reason.positive === positive)
    return (
      <fieldset className="reason-group">
        <legend>{title}</legend>
        {group.map((reason) => (
          <button
            key={reason.key}
            type="button"
            aria-pressed={chosen.has(reason.key)}
            className={`${positive ? 'good' : 'bad'}${chosen.has(reason.key) ? ' on' : ''}`}
            onClick={() => onToggle(reason.key)}
          >
            {reason.label}
          </button>
        ))}
      </fieldset>
    )
  }

  return (
    <form
      className="rating-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <fieldset className="star-picker">
        <legend>Wie viele Sterne?</legend>
        {STARS.map((n) => (
          <button
            key={n}
            type="button"
            aria-label={n === 1 ? '1 Stern' : `${n} Sterne`}
            aria-pressed={n === stars}
            className={n <= stars ? 'on' : ''}
            onClick={() => onStars(n)}
          >
            ★
          </button>
        ))}
      </fieldset>
      {reasons === null ? (
        <p className="hint">Lädt …</p>
      ) : (
        <>
          {reasonGroup('Was ist gut?', true)}
          {reasonGroup('Was ist nicht gut?', false)}
        </>
      )}
      {missing && <p className="hint">{missing}</p>}
      <button type="submit" className="rate-button" disabled={busy || missing !== null}>
        Bewertung speichern
      </button>
      <button type="button" className="link-button" onClick={onCancel}>
        Abbrechen
      </button>
    </form>
  )
}

// The Ratings part of the Place detail (SCRUM-31): average stars, the most chosen Reasons, the
// Condition, and the form to rate the Place or change the own Rating.
export default function PlaceRatings({ placeId, place, user, onLoginNeeded }: Props) {
  const [summary, setSummary] = useState<RatingSummary | null>(null)
  const [mine, setMine] = useState<Rating | null>(null)
  const [reasons, setReasons] = useState<Reason[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState(false)
  const [stars, setStars] = useState(0)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  // The issues this user answered "Ist das noch so?" for while the panel is open.
  const [voted, setVoted] = useState<Set<string>>(new Set())
  // The user just saved a Rating that names a Condition issue: ask about the City report.
  const [askReport, setAskReport] = useState(false)

  const reload = useCallback(() => {
    fetchRatingSummary(placeId, loadToken())
      .then(setSummary)
      .catch((err: Error) => setError(err.message))
  }, [placeId])

  // Other users' Ratings and votes show without a reload (SCRUM-98).
  usePlaceReloads(reload, placeId, onRatingChange)

  // The own Rating, so the form starts with it. App gives this part a new key per user.
  useEffect(() => {
    const token = loadToken()
    if (!user || !token) return
    fetchMyRating(token, placeId)
      .then(setMine)
      .catch((err: Error) => setError(err.message))
  }, [placeId, user])

  function startRating() {
    if (!user) {
      onLoginNeeded()
      return
    }
    setStars(mine?.stars ?? 0)
    setChosen(new Set(mine?.reasons ?? []))
    setError(null)
    setRating(true)
    if (!reasons) {
      fetchReasons(placeId)
        .then(setReasons)
        .catch((err: Error) => setError(err.message))
    }
  }

  function toggle(key: string) {
    const next = new Set(chosen)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setChosen(next)
  }

  async function submit() {
    const token = loadToken()
    if (!token) {
      onLoginNeeded()
      return
    }
    setBusy(true)
    setError(null)
    try {
      // In the order of the list, not the order of the taps.
      const keys = (reasons ?? []).map((r) => r.key).filter((key) => chosen.has(key))
      setMine(await saveRating(token, placeId, { stars, reasons: keys }))
      setRating(false)
      // With the token, like every other load of the summary (SCRUM-163).
      const fresh = await fetchRatingSummary(placeId, token)
      setSummary(fresh)
      // A chosen Reason that now shows as a Condition issue is something the city must fix.
      setAskReport(fresh.condition.issues.some((issue) => keys.includes(issue.key)))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function vote(issue: Issue, stillThere: boolean) {
    const token = loadToken()
    if (!user || !token) {
      onLoginNeeded()
      return
    }
    setBusy(true)
    setError(null)
    try {
      setSummary(await voteOnIssue(token, placeId, issue.key, stillThere))
      setVoted(new Set(voted).add(issue.key))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const missing = stars === 0 ? 'Wähle 1 bis 5 Sterne.' : chosen.size === 0 ? 'Wähle mindestens eine Begründung.' : null

  return (
    <div className="place-ratings">
      <h3>Bewertungen</h3>
      {summary &&
        (summary.average_stars === null ? (
          <p className="hint">Noch keine Bewertungen.</p>
        ) : (
          <p className="rating-average">
            {/* Read out as "4,0 von 5 Sternen" (SCRUM-163); the stars alone mean nothing to a screen reader. */}
            <span className="stars" role="img" aria-label={`${decimal.format(summary.average_stars)} von 5 Sternen`}>
              {starText(Math.round(summary.average_stars))}
            </span>{' '}
            <strong>{decimal.format(summary.average_stars)}</strong> · {ratings(summary.count)}
          </p>
        ))}
      {summary && summary.top_reasons.length > 0 && <ReasonChips reasons={summary.top_reasons} />}
      {summary && <ConditionLine summary={summary} voted={voted} busy={busy} onVote={vote} />}
      {summary && (
        <PlaceRatingList key={`${placeId}-${mine?.updated_at ?? 'none'}`} placeId={placeId} count={summary.count} />
      )}
      {rating ? (
        <RatingEditor
          stars={stars}
          chosen={chosen}
          reasons={reasons}
          busy={busy}
          missing={missing}
          onStars={setStars}
          onToggle={toggle}
          onSubmit={submit}
          onCancel={() => setRating(false)}
        />
      ) : (
        <button type="button" className="rate-button" onClick={startRating}>
          {mine ? `Bewertung ändern (${starText(mine.stars)})` : '⭐ Bewertung erstellen'}
        </button>
      )}

      {/* Under the rate button (SCRUM-82). */}
      {place && (
        <CityReportBox place={place} highlighted={summary?.condition.state === 'issues'} asked={askReport} />
      )}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}
