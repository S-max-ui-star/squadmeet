import { describe, expect, it } from 'vitest'
import { nearestSnap, nextSnap, snapHeights, stepSnap } from './sheetSnap'

describe('sheet snap (SCRUM-167)', () => {
  it('has the heights of the CSS: small at most 220 px, half 60 %, full the whole map', () => {
    expect(snapHeights(800)).toEqual({ small: 220, half: 480, full: 800 })
    expect(snapHeights(400)).toEqual({ small: 160, half: 240, full: 400 })
  })

  it('snaps to the closest height after a drag', () => {
    expect(nearestSnap(100, 800)).toBe('small')
    expect(nearestSnap(400, 800)).toBe('half')
    expect(nearestSnap(700, 800)).toBe('full')
  })

  it('goes half → full → small → half with a tap', () => {
    expect(nextSnap('half')).toBe('full')
    expect(nextSnap('full')).toBe('small')
    expect(nextSnap('small')).toBe('half')
  })

  it('goes one step with the arrow keys and stops at the ends', () => {
    expect(stepSnap('small', 1)).toBe('half')
    expect(stepSnap('half', 1)).toBe('full')
    expect(stepSnap('full', 1)).toBe('full')
    expect(stepSnap('half', -1)).toBe('small')
    expect(stepSnap('small', -1)).toBe('small')
  })
})
