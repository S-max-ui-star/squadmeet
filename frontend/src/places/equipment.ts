// The Equipment a user brings to a Meetup, per Activity type (SCRUM-170). The keys and the
// order must match ACTIVITY_EQUIPMENT in backend/app/equipment.py; the server checks them.
import type { EquipmentCount } from '../api/meetups'

export type EquipmentItem = {
  key: string
  label: string
  emoji: string
  // 1: the user brings it or not. More: the user says how many (Schläger, 1–4).
  max: number
}

const item = (key: string, label: string, emoji: string, max = 1): EquipmentItem => ({ key, label, emoji, max })

export const EQUIPMENT: Record<string, EquipmentItem[]> = {
  table_tennis: [item('rackets', 'Schläger', '🏓', 4), item('balls', 'Bälle', '⚪'), item('net', 'Netz', '🥅')],
  basketball: [item('ball', 'Ball', '🏀')],
  football: [item('ball', 'Ball', '⚽'), item('bibs', 'Leibchen', '🎽'), item('cones', 'Hütchen/Mini-Tore', '🔺')],
  beach_volleyball: [item('ball', 'Ball', '🏐'), item('net', 'Netz', '🥅')],
  outdoor_fitness: [item('jump_rope', 'Springseil', '🪢'), item('mat', 'Matte', '🧘'), item('band', 'Fitnessband', '🎗️')],
}

export const equipmentFor = (activityType: string | null | undefined) => EQUIPMENT[activityType ?? ''] ?? []

// "🏓 2 Schläger" for an item with a count, "⚪ Bälle" for one, "⚪ Bälle (2)" when two people
// bring it. An unknown key (a newer server) shows as it is instead of a crash.
export function equipmentText(activityType: string | null | undefined, { item: key, count }: EquipmentCount): string {
  const found = equipmentFor(activityType).find((each) => each.key === key)
  if (!found) return count > 1 ? `${key} (${count})` : key
  if (found.max > 1) return `${found.emoji} ${count} ${found.label}`
  return `${found.emoji} ${found.label}${count > 1 ? ` (${count})` : ''}`
}

export const equipmentLine = (activityType: string | null | undefined, items: EquipmentCount[]) =>
  items.map((each) => equipmentText(activityType, each)).join(' · ')
