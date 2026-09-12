import { Store, useStore } from '@tanstack/react-store'
import { useEffect } from 'react'

/**
 * The current time, shared by every component that shows a clock.
 *
 * One interval for the whole app rather than one per timer. The value only
 * ever moves forward, and it resyncs the instant the phone wakes up, because
 * an interval in a backgrounded tab is throttled or stopped outright.
 */
export const nowStore = new Store(Date.now())

let subscribers = 0
let timer: ReturnType<typeof setInterval> | null = null

function tick() {
  nowStore.setState(() => Date.now())
}

function start() {
  if (timer !== null) return
  tick()
  timer = setInterval(tick, 250)
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('focus', tick)
  window.addEventListener('pageshow', tick)
}

function stop() {
  if (timer === null) return
  clearInterval(timer)
  timer = null
  document.removeEventListener('visibilitychange', onVisible)
  window.removeEventListener('focus', tick)
  window.removeEventListener('pageshow', tick)
}

function onVisible() {
  if (document.visibilityState === 'visible') tick()
}

/** Subscribes to the shared clock. Returns the current epoch milliseconds. */
export function useNow(): number {
  useEffect(() => {
    subscribers += 1
    start()
    return () => {
      subscribers -= 1
      if (subscribers === 0) stop()
    }
  }, [])

  return useStore(nowStore)
}
