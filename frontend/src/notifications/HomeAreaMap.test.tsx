import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import HomeAreaMap from './HomeAreaMap'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | undefined

afterEach(() => {
  act(() => root?.unmount())
  document.body.innerHTML = ''
})

describe('HomeAreaMap (SCRUM-191)', () => {
  it('credits only OpenStreetMap in the corner, without the Leaflet prefix', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    root = createRoot(container)
    await act(async () =>
      root!.render(<HomeAreaMap point={null} radiusKm={2} fallbackCenter={[51.34, 12.37]} onPick={() => {}} />),
    )

    const credit = container.querySelector('.leaflet-control-attribution')!
    expect(credit.textContent).toBe('© OpenStreetMap')
    expect(credit.querySelector('a')?.getAttribute('href')).toBe('https://www.openstreetmap.org/copyright')
  })
})
