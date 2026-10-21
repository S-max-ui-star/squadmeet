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
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: placeName, text: placeName, url })
        setState('idle')
        return
      }
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(url)
      setState('copied')
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setState('idle')
      } else {
        setState('failed')
      }
    }
  }

  return (
    <>
      <button
        type="button"
        className="link-button place-detail-share"
        disabled={state === 'busy'}
        aria-live="polite"
        onClick={share}
      >
        {state === 'copied' ? 'Link kopiert' : 'Teilen'}
      </button>
      {state === 'failed' && <span className="form-error">Teilen nicht möglich.</span>}
    </>
  )
}
