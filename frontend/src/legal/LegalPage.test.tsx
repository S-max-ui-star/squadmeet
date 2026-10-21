import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it } from 'vitest'
import LegalPage from './LegalPage'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

afterEach(() => {
  document.body.innerHTML = ''
})

async function privacyText(photos: boolean) {
  const container = document.createElement('div')
  document.body.append(container)
  await act(async () => createRoot(container).render(<LegalPage kind="privacy" photos={photos} navigate={() => {}} />))
  return container.textContent ?? ''
}

// Photos are deferred (SCRUM-94): the stored ones stay, so the page still names them.
describe('LegalPage photos', () => {
  it('says that Photos are off, and still names the stored ones', async () => {
    const text = await privacyText(false)

    expect(text).toContain('Fotos sind zurzeit ausgeschaltet')
    expect(text).toContain('Amazon S3')
    expect(text).not.toContain('wenn du ein Foto eines Platzes hochlädst')
  })

  it('describes the upload while Photos are on', async () => {
    const text = await privacyText(true)

    expect(text).toContain('wenn du ein Foto eines Platzes hochlädst')
    expect(text).not.toContain('ausgeschaltet')
  })
})

describe('LegalPage reviewed account data', () => {
  it('describes aggregate and anonymous individual ratings', async () => {
    const text = await privacyText(false)

    expect(text).toContain('Zusammenfassung aller Bewertungen')
    expect(text).toContain('anonyme Liste der einzelnen Bewertungen')
    expect(text).toContain('Datum der letzten Änderung')
    expect(text).toContain('Deinen Nickname sehen sie dabei nicht')
  })

  it('describes the meetup handover when an account is deleted', async () => {
    const text = await privacyText(false)

    expect(text).toContain('offenes Treffen ohne Teilnehmende wird gelöscht')
    expect(text).toContain('zuerst beigetretenen Person als neuem Host')
    expect(text).toContain('ohne Verbindung zu deinem gelöschten Konto')
  })

  it('describes the live Home area only once', async () => {
    const text = await privacyText(false)

    expect(text).toContain('Wenn du einen Heimatbereich einschaltest')
    expect(text).not.toContain('sobald es diese Funktion gibt')
    expect(text.match(/Heimatbereich/g)).toHaveLength(1)
  })
})
