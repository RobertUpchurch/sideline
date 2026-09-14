import { registerSW } from 'virtual:pwa-register'
import { db } from '~/db/schema'

/**
 * Keeping an installed app off stale code.
 *
 * This is the one way an installed PWA behaves unlike a website: it keeps
 * running whatever JavaScript it was opened with. A phone that has had
 * Sideline on its home screen since March will still be running March's app
 * when it is opened in September, and because the routes are code-split, a
 * screen the coach has not opened yet may ask for a chunk that no longer
 * exists on the server. That surfaces as a screen that simply fails to
 * appear, which is impossible for anyone to report usefully.
 *
 * So: look for a new version whenever the app comes back to the foreground,
 * which is exactly the moment it has been sitting idle on old code. What
 * happens next depends on whether a game is on.
 */

const RELOAD_KEY = 'sideline:update-reloads'

/**
 * How many times one session may reload itself to apply an update.
 *
 * A guard, not a feature. If a cached document keeps coming back believing an
 * update is waiting, the app must not spin — better to run the old version
 * until it is next opened than to flicker in a coach's hand on a Saturday.
 */
const RELOAD_LIMIT = 2

function reloadCount(): number {
  try {
    return Number(sessionStorage.getItem(RELOAD_KEY) ?? '0') || 0
  } catch {
    // Private browsing, or storage the user has blocked. Assume the best.
    return 0
  }
}

function applyUpdate(): void {
  const count = reloadCount()
  if (count >= RELOAD_LIMIT) return
  try {
    sessionStorage.setItem(RELOAD_KEY, String(count + 1))
  } catch {
    // Not worth abandoning the update over.
  }
  window.location.reload()
}

/**
 * Whether a game is being played right now.
 *
 * Reloading is safe at any moment — the clock and every player's minutes are
 * derived from an event log in IndexedDB, so a reload restores the game
 * exactly as it was — but "safe" is not the same as "welcome". A coach
 * halfway through picking four players to bring on would lose that selection
 * and have to remember who they had tapped.
 */
async function gameInProgress(): Promise<boolean> {
  try {
    // The same question `liveGameQuery` asks, deliberately without going
    // through React Query: this runs before the app has mounted.
    return (await db.games.where('status').equals('live').count()) > 0
  } catch {
    return false
  }
}

export function keepUpToDate(): void {
  let deferred = false

  registerSW({
    immediate: true,
    async onNeedReload() {
      if (await gameInProgress()) {
        // Wait for the final whistle. The new version is already installed
        // and will be picked up the next time the app is opened, or at the
        // next foreground once the game is over.
        deferred = true
        return
      }
      applyUpdate()
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return
      const check = () => {
        if (document.visibilityState !== 'visible') return
        if (deferred) {
          void gameInProgress().then((live) => {
            if (!live) applyUpdate()
          })
          return
        }
        // Offline, which is most of the time, this rejects and nothing
        // happens. That is the normal case, not an error.
        void registration.update().catch(() => {})
      }
      document.addEventListener('visibilitychange', check)
      window.addEventListener('pageshow', check)
    },
  })

  /*
   * The backstop for a deferred update: a route the coach opens for the first
   * time asks for a chunk the new service worker has already cleared out of
   * the cache. A reload is the only way through, and a blank screen mid-game
   * is worse than a second of white.
   */
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault()
    applyUpdate()
  })
}
