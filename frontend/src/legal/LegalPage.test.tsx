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
