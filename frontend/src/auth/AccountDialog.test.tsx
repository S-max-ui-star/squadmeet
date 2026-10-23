import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { User } from '../api/auth'
import AccountDialog from './AccountDialog'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const admin: User = { id: 1, nickname: 'Steven', avatar: 'fox', is_admin: true, mfa_enabled: true }
const member: User = { id: 2, nickname: 'Anna', avatar: 'owl', is_admin: false, mfa_enabled: false }

afterEach(() => {
  document.body.innerHTML = ''
})

async function render({ user = admin, photos = true } = {}) {
  const handlers = {
    onPush: vi.fn(),
    onHomeArea: vi.fn(),
    onMfa: vi.fn(),
    onLogout: vi.fn(),
    onDelete: vi.fn(),
    onLockedPlaces: vi.fn(),
    onSuggestions: vi.fn(),
    onReports: vi.fn(),
    onPhotos: vi.fn(),
    onClose: vi.fn(),
  }
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => createRoot(container).render(<AccountDialog user={user} photos={photos} {...handlers} />))
  return { container, handlers }
}

// Each group: its heading and the text of its rows (a button or the legal links).
function groups(container: HTMLElement) {
  return [...container.querySelectorAll('section')].map((section) => ({
    title: section.querySelector('h3')?.textContent ?? null,
    rows: [...section.querySelectorAll('.account-row, .legal-links-inline')].map((row) => row.textContent),
  }))
}

const row = (container: HTMLElement, text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('button.account-row')].find((b) =>
    b.textContent?.startsWith(text),
  )!

describe('AccountDialog (SCRUM-169)', () => {
  it('shows the avatar and the Nickname at the top', async () => {
    const { container } = await render({ user: member })

    const profile = container.querySelector('.account-profile')!
    expect(profile.textContent).toBe('🦉Anna')
    expect(profile.compareDocumentPosition(container.querySelector('section')!)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    )
  })

  it('groups the rows for a user: Einstellungen, Sonstiges, then "Konto löschen" alone', async () => {
    const { container } = await render({ user: member })

    expect(groups(container)).toEqual([
      {
        title: 'Einstellungen',
        rows: ['Push-Benachrichtigungen', 'Heimatbereich', 'Zwei-Faktor-Anmeldungaus'],
      },
      { title: 'Sonstiges', rows: ['Datenschutz · Impressum', 'Abmelden'] },
      { title: null, rows: ['Konto löschen'] },
    ])
  })

  it('shows the two-factor state as the value of its row', async () => {
    const { container } = await render({ user: admin })

    expect(row(container, 'Zwei-Faktor-Anmeldung').querySelector('.account-row-value')?.textContent).toBe('an')
  })

  it('gives an Admin the moderation entries in their own group, before Sonstiges', async () => {
    const { container } = await render({ user: admin })

    expect(groups(container).map((group) => group.title)).toEqual([
      'Einstellungen',
      'Moderation',
      'Sonstiges',
      null,
    ])
    expect(groups(container)[1].rows).toEqual([
      'Platzvorschläge freigeben',
      'Gemeldete Plätze',
      'Fotos freigeben',
      'Gesperrte Plätze',
    ])
  })

  it('hides "Fotos freigeben" while Photos are off (SCRUM-94)', async () => {
    const { container } = await render({ photos: false })

    expect(groups(container)[1].rows).toEqual(['Platzvorschläge freigeben', 'Gemeldete Plätze', 'Gesperrte Plätze'])
  })

  it('marks "Konto löschen" as destructive, as the last row', async () => {
    const { container } = await render()

    const rows = [...container.querySelectorAll('button.account-row')]
    const remove = row(container, 'Konto löschen')
    expect(rows.at(-1)).toBe(remove)
    expect(remove.classList.contains('destructive')).toBe(true)
  })

  it('opens the same dialog or action from each row', async () => {
    const { container, handlers } = await render()
    const rows: [string, keyof typeof handlers][] = [
      ['Push-Benachrichtigungen', 'onPush'],
      ['Heimatbereich', 'onHomeArea'],
      ['Zwei-Faktor-Anmeldung', 'onMfa'],
      ['Platzvorschläge freigeben', 'onSuggestions'],
      ['Gemeldete Plätze', 'onReports'],
      ['Fotos freigeben', 'onPhotos'],
      ['Gesperrte Plätze', 'onLockedPlaces'],
      ['Abmelden', 'onLogout'],
      ['Konto löschen', 'onDelete'],
    ]

    for (const [text, handler] of rows) {
      await act(async () => row(container, text).click())
      expect(handlers[handler], text).toHaveBeenCalledOnce()
    }
    expect(handlers.onClose).not.toHaveBeenCalled()
  })

  it('opens Datenschutz and Impressum in a new tab, so the dialog stays open', async () => {
    const { container } = await render()

    const links = [...container.querySelectorAll<HTMLAnchorElement>('section .legal-links-inline a')]
    expect(links.map((link) => link.target)).toEqual(['_blank', '_blank'])
  })

  it('closes with the × at the top, as the Place panel (SCRUM-85)', async () => {
    const { handlers } = await render()

    await act(async () => document.querySelector<HTMLButtonElement>('.dialog-close')!.click())

    expect(handlers.onClose).toHaveBeenCalledOnce()
  })
})
