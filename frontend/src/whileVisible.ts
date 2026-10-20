// A page in the background sends no requests (SCRUM-78). Polls skip their turn while the page is
// hidden, and load once when it comes back to the front, so nothing stays old.

export function pageVisible(): boolean {
  return document.visibilityState === 'visible'
}

// Calls run every `ms` while the page is visible, and once when it becomes visible again.
// Returns the function that stops it.
export function whileVisible(run: () => void, ms: number): () => void {
  const timer = setInterval(() => {
    if (pageVisible()) run()
  }, ms)
  const onVisibility = () => {
    if (pageVisible()) run()
  }
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    clearInterval(timer)
    document.removeEventListener('visibilitychange', onVisibility)
  }
}
