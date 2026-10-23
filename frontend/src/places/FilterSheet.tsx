import type { TimeSpan } from '../api/meetups'
import Dialog from '../Dialog'
import ActivityFilter from './ActivityFilter'
import type { ActivityType } from './activities'
import TimeFilter from './TimeFilter'

type Props = {
  span: TimeSpan | null
  chosen: ReadonlySet<ActivityType>
  onSpanChange: (span: TimeSpan | null) => void
  onChosenChange: (chosen: Set<ActivityType>) => void
  onClose: () => void
}

/** Phones only (SCRUM-175): the Time filter and the activity filter, opened from "Filter" in the
 * bottom bar instead of two rows over the map. A change applies at once; the sheet is half the
 * screen high (CSS), so the user sees the markers change. */
export default function FilterSheet({ span, chosen, onSpanChange, onChosenChange, onClose }: Props) {
  return (
    <Dialog title="Filter" className="filter-sheet" onClose={onClose}>
      <h3>Zeit</h3>
      <TimeFilter span={span} onSpanChange={onSpanChange} />
      <h3>Aktivitäten</h3>
      <ActivityFilter chosen={chosen} onChange={onChosenChange} />
    </Dialog>
  )
}
