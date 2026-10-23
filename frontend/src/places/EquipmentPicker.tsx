import { useState } from 'react'
import type { EquipmentCount } from '../api/meetups'
import { equipmentFor } from './equipment'

type Props = {
  activityType: string | null | undefined
  value: EquipmentCount[]
  onChange: (value: EquipmentCount[]) => void
  // "Ausrüstung ändern" opens it at once; the create and Join forms keep it closed.
  defaultOpen?: boolean
}

// "Ausrüstung (freiwillig)" in the create, Join and change forms (SCRUM-170). Closed by default,
// so the forms stay as short as before. Each item of the Place's Activity type is "–" or
// "Bringe"; Schläger also get a count.
export default function EquipmentPicker({ activityType, value, onChange, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  const items = equipmentFor(activityType)
  if (items.length === 0) return null
  const countOf = (key: string) => value.find((each) => each.item === key)?.count ?? 0
  // In the order of the list, so the request reads like the form.
  const set = (key: string, count: number) =>
    onChange(
      items
        .map((each) => ({ item: each.key, count: each.key === key ? count : countOf(each.key) }))
        .filter((each) => each.count > 0),
    )
  return (
    <div className="equipment-picker">
      <button type="button" className="link-button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Ausrüstung (freiwillig) {open ? '▾' : '▸'}
      </button>
      {open && (
        <ul>
          {items.map((item) => {
            const count = countOf(item.key)
            return (
              <li key={item.key} className="equipment-row">
                <span>{item.emoji} {item.label}</span>
                <span className="equipment-chips" role="group" aria-label={item.label}>
                  <button type="button" aria-label={`${item.label}: nicht dabei`} aria-pressed={count === 0} className={count === 0 ? 'on' : ''} onClick={() => set(item.key, 0)}>
                    –
                  </button>
                  <button type="button" aria-label={`${item.label}: bringe ich mit`} aria-pressed={count > 0} className={count > 0 ? 'on' : ''} onClick={() => set(item.key, count || 1)}>
                    Bringe{item.max > 1 && count > 0 ? ` ${count}` : ''}
                  </button>
                  {item.max > 1 && count > 0 && (
                    <>
                      <button type="button" aria-label={`${item.label}: weniger`} disabled={count <= 1} onClick={() => set(item.key, count - 1)}>−</button>
                      <button type="button" aria-label={`${item.label}: mehr`} disabled={count >= item.max} onClick={() => set(item.key, count + 1)}>+</button>
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
