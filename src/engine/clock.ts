import type { ClockState, GameEvent, TeamSettings } from './types'

/** A stretch of wall-clock time during which the game clock was advancing. */
export interface RunSegment {
  period: number
  start: number
  end: number
}

/** Events in the order they happened. Ties broken by sequence number. */
export function sortEvents(events: readonly GameEvent[]): GameEvent[] {
  return [...events].sort((a, b) => a.ts - b.ts || a.seq - b.seq)
}

/**
 * Events that had already happened at `now`, in order.
 *
 * Every derivation answers "what was true at this instant", so events dated
 * after that instant must not colour the answer. In a live game `now` is
 * always the latest moment and this changes nothing, but it is what makes
 * replaying a game to an earlier point give the right picture.
 */
export function eventsUpTo(events: readonly GameEvent[], now: number): GameEvent[] {
  return sortEvents(events).filter((event) => event.ts <= now)
}

/**
 * The stretches of real time during which the clock ran.
 *
 * Everything else in the engine is built on this. Because it is derived from
 * wall-clock timestamps rather than from a ticking counter, a phone that
 * sleeps for ten minutes wakes up with the right answer.
 */
export function runSegments(events: readonly GameEvent[], now: number): RunSegment[] {
  const ordered = eventsUpTo(events, now)
  const segments: RunSegment[] = []
  let period = 0
  let openedAt: number | null = null
  let ended = false

  const close = (at: number) => {
    if (openedAt === null) return
    if (at > openedAt) segments.push({ period, start: openedAt, end: at })
    openedAt = null
  }

  for (const event of ordered) {
    switch (event.type) {
      case 'period_start':
        close(event.ts)
        period = event.period
        openedAt = event.ts
        break
      case 'pause':
        close(event.ts)
        break
      case 'resume':
        if (openedAt === null && period > 0 && !ended) openedAt = event.ts
        break
      case 'period_end':
        close(event.ts)
        break
      case 'game_end':
        close(event.ts)
        ended = true
        break
      default:
        break
    }
  }

  if (openedAt !== null && !ended) close(Math.max(now, openedAt))
  return segments
}

/** How much running time falls inside the half-open window `[from, to)`. */
export function runningMsBetween(
  segments: readonly RunSegment[],
  from: number,
  to: number,
): number {
  if (to <= from) return 0
  let total = 0
  for (const segment of segments) {
    const start = Math.max(segment.start, from)
    const end = Math.min(segment.end, to)
    if (end > start) total += end - start
  }
  return total
}

function elapsedInPeriod(segments: readonly RunSegment[], period: number): number {
  let total = 0
  for (const segment of segments) {
    if (segment.period === period) total += segment.end - segment.start
  }
  return total
}

/**
 * The state of the game clock at `now`.
 *
 * The coach starts each period by hand, at the referee's whistle, so this
 * never runs ahead of the actual game. The break countdown starts on its own
 * the moment a period ends, because that is when the break actually starts.
 */
export function deriveClock(
  events: readonly GameEvent[],
  settings: TeamSettings,
  now: number,
): ClockState {
  const ordered = eventsUpTo(events, now)
  const segments = runSegments(ordered, now)

  let period = 0
  let paused = false
  let inPeriod = false
  let lastPeriodEndTs: number | null = null
  let gameEnded = false
  const stoppageByPeriod = new Map<number, number>()

  for (const event of ordered) {
    switch (event.type) {
      case 'period_start':
        period = event.period
        inPeriod = true
        paused = false
        lastPeriodEndTs = null
        break
      case 'pause':
        if (inPeriod) paused = true
        break
      case 'resume':
        if (inPeriod) paused = false
        break
      case 'period_end':
        inPeriod = false
        paused = false
        lastPeriodEndTs = event.ts
        break
      case 'stoppage_added':
        stoppageByPeriod.set(
          event.period,
          (stoppageByPeriod.get(event.period) ?? 0) + event.ms,
        )
        break
      case 'game_end':
        gameEnded = true
        inPeriod = false
        paused = false
        break
      default:
        break
    }
  }

  const effectivePeriod = period === 0 ? 1 : period
  const stoppageMs = stoppageByPeriod.get(effectivePeriod) ?? 0
  const periodLengthMs = settings.periodMs + stoppageMs
  const elapsedMs = period === 0 ? 0 : elapsedInPeriod(segments, period)
  const remainingMs = Math.max(0, periodLengthMs - elapsedMs)

  const finishedFinalPeriod =
    !inPeriod && lastPeriodEndTs !== null && period >= settings.periods
  const isComplete = gameEnded || finishedFinalPeriod

  let phase: ClockState['phase']
  if (isComplete) phase = 'final'
  else if (inPeriod) phase = paused ? 'paused' : 'running'
  else if (lastPeriodEndTs !== null) phase = 'break'
  else phase = 'pregame'

  const breakRemainingMs =
    phase === 'break' && lastPeriodEndTs !== null
      ? Math.max(0, settings.breakMs - (now - lastPeriodEndTs))
      : 0

  return {
    phase,
    period: effectivePeriod,
    elapsedMs,
    remainingMs,
    stoppageMs,
    periodLengthMs,
    breakRemainingMs,
    isRunning: phase === 'running',
    isComplete,
  }
}

/** The period the coach would start next, or null when the game is over. */
export function nextPeriod(clock: ClockState, settings: TeamSettings): number | null {
  if (clock.isComplete) return null
  if (clock.phase === 'pregame') return 1
  if (clock.phase === 'break') {
    const next = clock.period + 1
    return next <= settings.periods ? next : null
  }
  return null
}

/** Human label for a period: "1st half" for two, "Q3" for four, and so on. */
export function periodLabel(period: number, periods: number): string {
  if (periods === 2) return period === 1 ? '1st half' : '2nd half'
  if (periods === 4) return `Q${period}`
  return `Period ${period}`
}

/** Human label for the break that follows a period. */
export function breakLabel(period: number, periods: number): string {
  if (periods === 2) return 'Halftime'
  return `Break after ${periodLabel(period, periods)}`
}
