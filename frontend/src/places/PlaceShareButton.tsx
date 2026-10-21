import { useState } from 'react'

const PUBLIC_ORIGIN = 'https://squadmeet.duckdns.org'

type Props = {
  placeId: number
  placeName: string
}

function publicPlaceUrl(placeId: number): string {
  return `${PUBLIC_ORIGIN}/platz/${placeId}`
}

export default function PlaceShareButton({ placeId, placeName }: Props) {
  const [state, setState] = useState<'idle' | 'busy' | 'copied' | 'failed'>('idle')

  async function share() {
    if (state === 'busy') return
    setState('busy')
    const url = publicPlaceUrl(placeId)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: placeName, text: placeName, url })
        setState('idle')
        return
      } catch (error) {
        // The user closed the share sheet: nothing more to do.
        if (error instanceof DOMException && error.name === 'AbortError') {
          setState('idle')
          return
        }
        // The browser refused the share sheet: copy the link instead (SCRUM-163).
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch {
      setState('failed')
    }
  }

  return (
    <>
      <button type="button" className="link-button place-detail-share" disabled={state === 'busy'} onClick={share}>
        {state === 'copied' ? 'Link kopiert' : 'Teilen'}
      </button>
      {/* Always in the page, so a screen reader reads the result out (SCRUM-160). */}
      <span role="status" className={state === 'failed' ? 'form-error' : 'visually-hidden'}>
        {state === 'copied' ? 'Link kopiert.' : state === 'failed' ? 'Teilen nicht möglich.' : ''}
      </span>
    </>
  )
}
