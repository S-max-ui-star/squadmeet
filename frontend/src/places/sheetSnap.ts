// SCRUM-167: the heights the Place detail can snap to on a phone, like the sheet of a map app.
export type Snap = 'small' | 'half' | 'full'

const ORDER: Snap[] = ['small', 'half', 'full']

export const SNAP_LABEL: Record<Snap, string> = { small: 'klein', half: 'halb', full: 'ganz' }

// The heights in pixels for a map of this height; they match the CSS of each state.
export function snapHeights(container: number): Record<Snap, number> {
  return { small: Math.min(220, container * 0.4), half: container * 0.6, full: container }
}

// After a drag: the state whose height is closest to where the user let go.
export function nearestSnap(height: number, container: number): Snap {
  const heights = snapHeights(container)
  return ORDER.reduce((best, snap) =>
    Math.abs(heights[snap] - height) < Math.abs(heights[best] - height) ? snap : best,
  )
}

// A tap on the grip: half → full → small → half, so every state is one or two taps away.
export function nextSnap(snap: Snap): Snap {
  return snap === 'half' ? 'full' : snap === 'full' ? 'small' : 'half'
}

// Arrow up or down on the grip: one state bigger or smaller, no wrap.
export function stepSnap(snap: Snap, direction: 1 | -1): Snap {
  const index = Math.min(ORDER.length - 1, Math.max(0, ORDER.indexOf(snap) + direction))
  return ORDER[index]
}
