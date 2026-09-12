import { useEffect } from 'react'

/**
 * Keeping Sideline upright.
 *
 * There are three levers and none of them works everywhere:
 *
 * 1. The manifest asks for `orientation: portrait`. An installed Android app
 *    honours that and will not rotate at all.
 * 2. `screen.orientation.lock()` does the same from script, but only in an
 *    installed or fullscreen context, and Safari has never implemented it.
 * 3. Nothing at all works on an iPhone. A home-screen web app there rotates
 *    with the device and no web API can refuse.
 *
 * So the lock is attempted quietly for the platforms that honour it. On an
 * iPhone it simply fails, and the coach's own Rotation Lock in Control Centre
 * is the only thing that will hold the screen still. Nothing is shown about
 * that: a banner appearing over the clock because the phone turned while its
 * owner was running would be worse than the turn.
 */
export function useLockPortrait(): void {
  useEffect(() => {
    const orientation = screen.orientation as
      | (ScreenOrientation & { lock?: (to: string) => Promise<void> })
      | undefined
    if (!orientation?.lock) return
    // Rejects on any platform that does not allow it. That is expected, and
    // there is nothing to tell the coach about it.
    void orientation.lock('portrait').catch(() => {})
  }, [])
}

