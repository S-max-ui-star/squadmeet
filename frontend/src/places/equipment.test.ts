import { describe, expect, it } from 'vitest'
import { ACTIVITY_TYPES } from './activities'
import { EQUIPMENT, equipmentFor, equipmentLine, equipmentText } from './equipment'

describe('equipment (SCRUM-170)', () => {
  it('has items for every Activity type', () => {
    expect(Object.keys(EQUIPMENT).sort()).toEqual([...ACTIVITY_TYPES].sort())
  })

  it('shows a count only where it means something', () => {
    expect(equipmentText('table_tennis', { item: 'rackets', count: 2 })).toBe('🏓 2 Schläger')
    expect(equipmentText('table_tennis', { item: 'balls', count: 1 })).toBe('⚪ Bälle')
    // Two people bring a ball each.
    expect(equipmentText('table_tennis', { item: 'balls', count: 2 })).toBe('⚪ Bälle (2)')
  })

  it('uses the ball of the Place\'s Activity type', () => {
    expect(equipmentText('football', { item: 'ball', count: 1 })).toBe('⚽ Ball')
    expect(equipmentText('basketball', { item: 'ball', count: 1 })).toBe('🏀 Ball')
  })

  it('joins the items into one line', () => {
    const items = [{ item: 'rackets', count: 2 }, { item: 'balls', count: 1 }]
    expect(equipmentLine('table_tennis', items)).toBe('🏓 2 Schläger · ⚪ Bälle')
  })

  it('shows an unknown key as it is and offers nothing for an unknown Activity type', () => {
    expect(equipmentText('table_tennis', { item: 'kite', count: 1 })).toBe('kite')
    expect(equipmentFor('chess')).toEqual([])
    expect(equipmentFor(null)).toEqual([])
  })
})
