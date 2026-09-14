import type { AnyRouter, ParsedLocation } from '@tanstack/react-router'

/**
 * Which way the screens move.
 *
 * A web app has one navigation — "go here". An app that feels like an app has
 * three, and using the wrong one produces the class of bug people describe as
 * "it went weird":
 *
 * - **push** — opening something: a team, a game, the season. The new screen
 *   comes in from the right, over the one you were on.
 * - **pop** — going back. The current screen slides off to the right and
 *   reveals what was underneath. The header's back link and the phone's own
 *   back gesture are the same move, so they must look the same.
 * - **replace** — the screen you were on has ceased to exist, because the
 *   game or team it was showing has just been deleted or finished. It takes
 *   the old screen's place in history rather than stacking on top, so a
 *   forward swipe cannot reach a screen with nothing left to show. Those call
 *   sites pass `replace: true`; there is nothing to animate, so it fades.
 *
 * Nothing here has to be chosen at the call site. The browser already knows:
 * every history entry carries an index, and comparing the one being left with
 * the one being entered says which of the three this is. That also means the
 * system back gesture — which never goes through our code at all — animates
 * correctly for free.
 */
type Direction = 'push' | 'pop' | 'replace'

function indexOf(location: ParsedLocation | undefined): number | undefined {
  const index = location?.state.__TSR_index
  return typeof index === 'number' ? index : undefined
}

function directionOf(
  from: ParsedLocation | undefined,
  to: ParsedLocation | undefined,
): Direction {
  const a = indexOf(from)
  const b = indexOf(to)
  if (a === undefined || b === undefined || a === b) return 'replace'
  return b > a ? 'push' : 'pop'
}

/**
 * Stamps the direction on the document so the stylesheet can pick the pair of
 * animations to run.
 *
 * A view transition only ever sees one DOM replacing another; it has no idea
 * whether that is forwards or backwards, and no way to find out. Telling it
 * has to happen before the transition starts, which is what this does.
 */
export function watchNavDirection(router: AnyRouter): void {
  router.subscribe('onBeforeNavigate', ({ fromLocation, toLocation }) => {
    document.documentElement.dataset.nav = directionOf(fromLocation, toLocation)
  })
}
