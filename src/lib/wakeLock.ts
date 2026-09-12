import { useEffect } from 'react'

/**
 * Keeps the screen awake while a game is live.
 *
 * The clock is correct whether the screen sleeps or not, but a coach who has
 * to wake their phone to make a substitution will stop using the app by the
 * second half. Unsupported browsers simply do nothing.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    if (!('wakeLock' in navigator)) return

    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen')
      } catch {
        // Denied, or the tab was hidden at the moment we asked. Not fatal.
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) void acquire()
    }

    void acquire()
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
    }
  }, [active])
}
