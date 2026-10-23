import { useState } from 'react'
import type { EquipmentChoice } from '../api/meetups'
import { equipmentFor } from './equipment'

type Props = {
  activityType: string | null | undefined
  value: EquipmentChoice[]
  onChange: (value: EquipmentChoice[]) => void
  // "Ausrüstung ändern" opens it at once; the create and Join forms keep it closed.
  defaultOpen?: boolean
}

type Kind = 'bring' | 'need'

// "Ausrüstung (freiwillig)" in the create, Join and change forms (SCRUM-170). Closed by default,
// so the forms stay as short as before. Each item of the Place's Activity type is "–", "Bringe"
// or "Brauche" (SCRUM-171), never both; Schläger also get a count.
export default function EquipmentPicker({ activityType, value, onChange, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const items = equipmentFor(activityType)
  if (items.length === 0) return null
  const choiceOf = (key: string) => value.find((each) => each.item === key)
  const kindOf = (choice: EquipmentChoice): Kind => choice.kind ?? 'bring'
  // In the order of the list, so the request reads like the form. A brought item has no
  // `kind`, so the body is as before SCRUM-171.
  const set = (key: string, count: number, kind: Kind) =>
    onChange(
      items.flatMap((each): EquipmentChoice[] => {
        const old = choiceOf(each.key)
        const n = each.key === key ? count : (old?.count ?? 0)
        const k = each.key === key ? kind : old && kindOf(old)
        if (n === 0) return []
        return [k === 'need' ? { item: each.key, count: n, kind: 'need' } : { item: each.key, count: n }]
      }),
    )
  return (
    <div className="equipment-picker">
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Ausrüstung (freiwillig) {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul>
          {items.map((item) => {
            const choice = choiceOf(item.key)
            const count = choice?.count ?? 0
            const kind = choice ? kindOf(choice) : null
            // A switch from "Bringe" to "Brauche" keeps the count.
            const chip = (to: Kind, text: string, label: string) => (
              <button type="button" aria-label={`${item.label}: ${label}`} aria-pressed={kind === to} className={kind === to ? 'on' : ''} onClick={() => set(item.key, count || 1, to)}>
                {text}{item.max > 1 && kind === to ? ` ${count}` : ''}
              </button>
            )
            return (
              <li key={item.key} className="equipment-row">
                <span>{item.emoji} {item.label}</span>
                <span className="equipment-chips" role="group" aria-label={item.label}>
                  <button type="button" aria-label={`${item.label}: nicht dabei`} aria-pressed={kind === null} className={kind === null ? 'on' : ''} onClick={() => set(item.key, 0, 'bring')}>
                    –
                  </button>
                  {chip('bring', 'Bringe', 'bringe ich mit')}
                  {chip('need', 'Brauche', 'brauche ich')}
                  {item.max > 1 && kind !== null && (
                    <>
                      <button type="button" aria-label={`${item.label}: weniger`} disabled={count <= 1} onClick={() => set(item.key, count - 1, kind)}>−</button>
                      <button type="button" aria-label={`${item.label}: mehr`} disabled={count >= item.max} onClick={() => set(item.key, count + 1, kind)}>+</button>
                    </>
                  )}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
