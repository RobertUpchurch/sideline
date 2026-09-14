/**
 * A tick under the thumb, where the platform allows one.
 *
 * Two entirely separate mechanisms, because there is no common one:
 *
 * - **Android and desktop** expose `navigator.vibrate`. That is this file.
 * - **iOS has no vibration API and never has.** The only route to the Taptic
 *   engine from a web page is that Safari plays the system haptic when a
 *   person toggles an `<input type="checkbox" switch>` — and only when a
 *   person does it. A scripted `.click()` on one produces nothing. So on an
 *   iPhone the feedback has to come from the element itself, which is why
 *   `HapticButton` in `components/ui.tsx` is built the way it is rather than
 *   being a function you call from a handler.
 *
 * Used sparingly and deliberately: the clock, the score and a completed
 * substitution. Those are the things a coach does while looking at the field
 * rather than at the phone, so a confirmation they can feel saves them
 * looking down to check it worked. A buzz on every tap in the app would just
 * be noise, and would say nothing.
 */
export function haptic(): void {
  const nav = navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean
  }
  try {
    // Short enough to read as a tick rather than a buzz.
    nav.vibrate?.(12)
  } catch {
    // Some browsers expose it and refuse to use it. Nothing to do here.
  }
}
