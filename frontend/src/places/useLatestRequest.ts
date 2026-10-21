import { useCallback, useEffect, useRef } from 'react'

type Load<T> = (signal: AbortSignal) => Promise<T>

// Only the newest load counts (SCRUM-156, SCRUM-161): a new one aborts the one before, and the
// answer of an older one is dropped, so it can never replace newer data. An aborted load calls
// nothing. `cancel` drops the open load, e.g. before an action writes its own fresh answer.
export function useLatestRequest() {
  const current = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    current.current?.abort()
    current.current = null
  }, [])

  const run = useCallback(<T>(load: Load<T>, onDone: (value: T) => void, onError: (err: Error) => void) => {
    current.current?.abort()
    const controller = new AbortController()
    current.current = controller
    const latest = () => {
      if (current.current !== controller) return false
      current.current = null
      return true
    }
    load(controller.signal).then(
      (value) => {
        if (latest()) onDone(value)
      },
      (err: Error) => {
        if (latest()) onError(err)
      },
    )
  }, [])

  // Nothing is set after the part is gone.
  useEffect(() => cancel, [cancel])

  return { run, cancel }
}
