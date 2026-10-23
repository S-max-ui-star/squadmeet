import type { TimeSpan } from '../api/meetups'

const SPANS: { value: TimeSpan; label: string }[] = [
  { value: 'now', label: 'Jetzt' },
  { value: '3h', label: '3 h' },
  { value: '6h', label: '6 h' },
  { value: 'today', label: 'Heute' },
]

type Props = {
  span: TimeSpan | null
  onSpanChange: (span: TimeSpan | null) => void
}

// The Time filter (SCRUM-54): a second tap on the chosen span switches it off. On the map on a
// laptop, in the filter sheet on a phone (SCRUM-175).
export default function TimeFilter({ span, onSpanChange }: Props) {
  return (
    <div className="time-filter" role="group" aria-label="Treffen nach Zeit filtern">
      {SPANS.map(({ value, label }) => (
        <button
          key={value}
          type="button"
          aria-pressed={span === value}
          className={span === value ? 'on' : ''}
          onClick={() => onSpanChange(span === value ? null : value)}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
