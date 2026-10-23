import { createContext, useContext, useEffect } from 'react'
import type { RatingSummary } from '../api/ratings'

// SCRUM-176: the folded "Problem melden" at the end of the Place detail. PlaceRatings knows when a
// Rating names a Condition issue, so it shows its City report in there (a portal into `slot`),
// opens the fold after such a Rating and marks it while the Condition has issues.
export type ProblemFold = {
  slot: HTMLElement | null
  open: () => void
  setHighlighted: (on: boolean) => void
}

export const ProblemFoldContext = createContext<ProblemFold | null>(null)

// For PlaceRatings: tells the fold (if there is one) whether the Condition has issues and whether
// the user just saved a Rating that names one.
export function useProblemFold(summary: RatingSummary | null, asked: boolean) {
  const fold = useContext(ProblemFoldContext)
  const issues = summary?.condition.state === 'issues'
  useEffect(() => fold?.setHighlighted(issues), [fold, issues])
  useEffect(() => {
    if (asked) fold?.open()
  }, [fold, asked])
  return { fold, issues }
}
