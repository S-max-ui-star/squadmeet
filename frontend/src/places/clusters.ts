import type { Spot } from './spots'

// SCRUM-166: markers that would overlap on the screen become one cluster marker. The distance is
// measured in screen pixels at the current zoom, so the clusters split while the user zooms in.
// A marker is 34 px wide; seeds are always more than CLUSTER_RADIUS apart, so no two markers
// overlap by more than a few pixels.
export const CLUSTER_RADIUS = 36

// From this zoom on every Place has its own marker (the search zooms to 17, SCRUM-52).
export const NO_CLUSTER_ZOOM = 17

export type Cluster = { lat: number; lon: number; spots: Spot[] }
export type Point = { x: number; y: number }

export type Clustered = { singles: Spot[]; clusters: Cluster[] }

// Greedy: the spots in a fixed order (by their first Place id, so a pan keeps the same seeds);
// each spot not taken yet is a seed and takes every free spot within the radius. The cluster sits
// on its seed, so it is always on a real Place. keepApart spots (someone is there now, or the
// open Place) never join a cluster: they must stay visible.
export function clusterSpots(
  spots: Spot[],
  project: (lat: number, lon: number) => Point,
  keepApart: (spot: Spot) => boolean,
  radius = CLUSTER_RADIUS,
): Clustered {
  const singles: Spot[] = []
  const clusters: Cluster[] = []
  const free: { spot: Spot; point: Point }[] = []
  for (const spot of spots) {
    if (keepApart(spot)) singles.push(spot)
    else free.push({ spot, point: project(spot.lat, spot.lon) })
  }
  free.sort((a, b) => a.spot.places[0].id - b.spot.places[0].id)

  // A grid with cells of the radius: the neighbours of a point are in its own and the 8 cells
  // around it, so 2000 Places stay fast.
  const cellOf = (point: Point) => [Math.floor(point.x / radius), Math.floor(point.y / radius)]
  const grid = new Map<string, number[]>()
  free.forEach(({ point }, index) => {
    const [cx, cy] = cellOf(point)
    const key = `${cx},${cy}`
    const cell = grid.get(key)
    if (cell) cell.push(index)
    else grid.set(key, [index])
  })

  const taken = new Array<boolean>(free.length).fill(false)
  free.forEach((seed, index) => {
    if (taken[index]) return
    taken[index] = true
    const near = nearby(grid, cellOf(seed.point)).filter(
      (other) => !taken[other] && distance(free[other].point, seed.point) <= radius,
    )
    near.forEach((other) => (taken[other] = true))
    const members = [seed.spot, ...near.map((other) => free[other].spot)]
    if (members.length === 1) singles.push(seed.spot)
    else clusters.push({ lat: seed.spot.lat, lon: seed.spot.lon, spots: members })
  })
  return { singles, clusters }
}

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)

// The indexes in a grid cell and the 8 cells around it.
function nearby(grid: Map<string, number[]>, [cx, cy]: number[]): number[] {
  const found: number[] = []
  for (const dx of [-1, 0, 1]) {
    for (const dy of [-1, 0, 1]) found.push(...(grid.get(`${cx + dx},${cy + dy}`) ?? []))
  }
  return found
}

// How many Places a cluster has; the cluster marker shows this number.
export function placeCount(cluster: Cluster): number {
  return cluster.spots.reduce((sum, spot) => sum + spot.places.length, 0)
}

// The area of all Places in a cluster; a tap zooms there, so the cluster splits.
export function clusterBounds(cluster: Cluster): [[number, number], [number, number]] {
  const lats = cluster.spots.map((spot) => spot.lat)
  const lons = cluster.spots.map((spot) => spot.lon)
  return [
    [Math.min(...lats), Math.min(...lons)],
    [Math.max(...lats), Math.max(...lons)],
  ]
}
