import { describe, expect, it } from 'vitest'
import type { Place } from '../api/places'
import type { Spot } from './spots'
import { CLUSTER_RADIUS, clusterBounds, clusterSpots, placeCount } from './clusters'

// In these tests lat is the screen y and lon the screen x, in pixels.
const project = (lat: number, lon: number) => ({ x: lon, y: lat })
const never = () => false

const place = (id: number, people_now = 0): Place => ({
  id,
  name: '',
  activity_type: 'football',
  lat: 0,
  lon: 0,
  people_now,
  is_suggestion: false,
  confirmations: 0,
})
const spot = (id: number, y: number, x: number, people_now = 0): Spot => ({
  lat: y,
  lon: x,
  places: [{ ...place(id, people_now), lat: y, lon: x }],
})
const ids = (spots: Spot[]) => spots.map((s) => s.places[0].id)

describe('clusterSpots (SCRUM-166)', () => {
  it('leaves spots that are far apart alone', () => {
    const { singles, clusters } = clusterSpots([spot(1, 0, 0), spot(2, 0, 100), spot(3, 100, 0)], project, never)

    expect(clusters).toEqual([])
    expect(ids(singles)).toEqual([1, 2, 3])
  })

  it('puts close spots into one cluster on the seed with the lowest Place id', () => {
    const { singles, clusters } = clusterSpots([spot(3, 10, 10), spot(1, 0, 0), spot(2, 20, 0)], project, never)

    expect(singles).toEqual([])
    expect(clusters).toHaveLength(1)
    expect([clusters[0].lat, clusters[0].lon]).toEqual([0, 0])
    expect(ids(clusters[0].spots).sort()).toEqual([1, 2, 3])
  })

  it('counts the Places of a cluster, also on a spot with several Activity types', () => {
    const double: Spot = { lat: 0, lon: 0, places: [place(1), place(2)] }
    const { clusters } = clusterSpots([double, spot(3, 0, 10)], project, never)

    expect(placeCount(clusters[0])).toBe(3)
  })

  it('never puts a spot with people there now or the open Place into a cluster', () => {
    const live = spot(1, 0, 0, 2)
    const open = spot(2, 0, 5)
    const { singles, clusters } = clusterSpots([live, open, spot(3, 0, 10)], project, (s) => s === live || s === open)

    expect(clusters).toEqual([])
    expect(ids(singles)).toEqual([1, 2, 3])
  })

  it('keeps every two markers more than the radius apart, so they do not overlap', () => {
    // A dense 30 × 30 grid, 8 px apart, like the start view of Leipzig on a phone.
    const spots: Spot[] = []
    for (let row = 0; row < 30; row++) {
      for (let col = 0; col < 30; col++) spots.push(spot(row * 30 + col + 1, row * 8, col * 8))
    }

    const { singles, clusters } = clusterSpots(spots, project, never)

    const markers = [...singles, ...clusters].map((m) => ({ x: m.lon, y: m.lat }))
    for (let i = 0; i < markers.length; i++) {
      for (let j = i + 1; j < markers.length; j++) {
        const distance = Math.hypot(markers[i].x - markers[j].x, markers[i].y - markers[j].y)
        expect(distance).toBeGreaterThan(CLUSTER_RADIUS)
      }
    }
    // No Place gets lost.
    const placed = singles.length + clusters.reduce((sum, c) => sum + placeCount(c), 0)
    expect(placed).toBe(900)
  })

  it('gives the same clusters for the same Places in another order', () => {
    const spots = [spot(1, 0, 0), spot(2, 0, 30), spot(3, 0, 60), spot(4, 0, 90)]

    const first = clusterSpots(spots, project, never)
    const second = clusterSpots([...spots].reverse(), project, never)

    expect(first.clusters.map((c) => ids(c.spots).sort())).toEqual(second.clusters.map((c) => ids(c.spots).sort()))
  })

  it('gives the area of all Places of a cluster', () => {
    const { clusters } = clusterSpots([spot(1, 0, 0), spot(2, 20, 10), spot(3, 5, 30)], project, never)

    expect(clusterBounds(clusters[0])).toEqual([
      [0, 0],
      [20, 30],
    ])
  })
})
