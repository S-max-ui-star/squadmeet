import { snapHeights, type Snap } from './sheetSnap'

type Size = { x: number; y: number }

// The part of the map nothing covers, in map pixels.
export type FreePart = { phone: boolean; left: number; top: number; bottom: number }

// On a laptop the detail is a 360 px card on the left (index.css). On a phone the top controls
// cover the top and the sheet the bottom; the sheet's height comes from its snap state (SCRUM-167),
// not from its size now, because it grows while its content loads (SCRUM-173).
export function freePart(size: Size, topCovered: number, snap: Snap): FreePart {
  if (size.x >= 768) return { phone: false, left: 384, top: 0, bottom: size.y }
  return { phone: true, left: 0, top: topCovered, bottom: size.y - snapHeights(size.y)[snap] }
}

export function inFreePart(point: Size, size: Size, free: FreePart): boolean {
  return point.x >= free.left && point.x <= size.x && point.y >= free.top && point.y <= free.bottom
}

// How far to pan so the point moves to the middle of the free part (right of the card on a laptop).
export function panIntoFreePart(point: Size, size: Size, free: FreePart): [number, number] {
  return free.phone ? [0, point.y - (free.top + free.bottom) / 2] : [point.x - (free.left + size.x) / 2, 0]
}
