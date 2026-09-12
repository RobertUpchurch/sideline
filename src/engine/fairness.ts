import type { Id, PlayerTime } from './types'

/**
 * Which figure a calculation should use.
 *
 * Deciding who plays next uses `adjustedMs`, so a child who arrived at
 * halftime is not treated as though they had been sitting out all game.
 * Reporting what happened uses `playedMs`, because a handicap is not minutes
 * anybody actually spent on the field.
 */
export type TimePick = (time: PlayerTime) => number

export const adjustedMs: TimePick = (time) => time.totalMs + time.creditMs
export const playedMs: TimePick = (time) => time.totalMs

/** The team's mean. Adjusted for late arrivals unless told otherwise. */
export function averageMs(times: readonly PlayerTime[], pick: TimePick = adjustedMs): number {
  if (!times.length) return 0
  return times.reduce((sum, time) => sum + pick(time), 0) / times.length
}

/** The gap between the child who has played most and the one who has played least. */
export function spreadMs(times: readonly PlayerTime[], pick: TimePick = adjustedMs): number {
  if (!times.length) return 0
  const values = times.map(pick)
  return Math.max(...values) - Math.min(...values)
}

export type FairnessBand = 'behind' | 'even' | 'ahead'

/**
 * Whether a player needs time, has had their share, or is ahead.
 *
 * The tolerance is deliberately generous — a minute either side of the average
 * is not unfair, and flagging it would just make the screen shout.
 */
export function band(
  totalMs: number,
  average: number,
  toleranceMs = 60_000,
): FairnessBand {
  if (totalMs < average - toleranceMs) return 'behind'
  if (totalMs > average + toleranceMs) return 'ahead'
  return 'even'
}

/**
 * The bench, in the order the coach should use it.
 *
 * Least time played first. When two children have played the same amount, the
 * one who has been sitting longer goes on first.
 */
export function benchOrder(times: readonly PlayerTime[]): PlayerTime[] {
  return times
    .filter((time) => !time.onField)
    .sort((a, b) => adjustedMs(a) - adjustedMs(b) || b.benchMs - a.benchMs)
}

/** Players on the field, longest current stint first, so the tired ones surface. */
export function fieldOrder(times: readonly PlayerTime[]): PlayerTime[] {
  return times
    .filter((time) => time.onField)
    .sort((a, b) => adjustedMs(b) - adjustedMs(a) || b.currentStintMs - a.currentStintMs)
}

export interface SuggestedSwap {
  onPlayerId: Id
  offPlayerId: Id
  /** How much the gap between these two closes by making the swap. */
  gapMs: number
}

/**
 * The single swap that does most to even out playing time.
 *
 * The child who has played most comes off for the child who has played least.
 * Returns null when there is nobody to bring on, or when the two are already
 * level, in which case no swap is better than any other.
 */
export function suggestSwap(times: readonly PlayerTime[]): SuggestedSwap | null {
  const bench = benchOrder(times)
  const field = fieldOrder(times)
  if (!bench.length || !field.length) return null

  const comingOn = bench[0]!
  const comingOff = field[0]!
  const gapMs = adjustedMs(comingOff) - adjustedMs(comingOn)
  if (gapMs <= 0) return null

  return { onPlayerId: comingOn.playerId, offPlayerId: comingOff.playerId, gapMs }
}

/**
 * The fairest lineup to start the next period with: the children who have
 * played least so far.
 */
export function suggestLineup(
  times: readonly PlayerTime[],
  fieldSize: number,
): Id[] {
  return [...times]
    .sort((a, b) => adjustedMs(a) - adjustedMs(b) || b.benchMs - a.benchMs)
    .slice(0, Math.min(fieldSize, times.length))
    .map((time) => time.playerId)
}

/**
 * The lineup that should actually take the field next.
 *
 * The break screen shows the fairest lineup already selected, and a coach who
 * simply taps start expects exactly that to happen. Anything other than a
 * complete choice falls back to the suggestion rather than carrying the last
 * period's lineup over, which would make the screen a lie.
 */
export function lineupForNextPeriod(
  chosen: readonly Id[] | null,
  times: readonly PlayerTime[],
  fieldSize: number,
): Id[] {
  const target = Math.min(fieldSize, times.length)
  if (chosen && chosen.length === target) return [...chosen]
  return suggestLineup(times, fieldSize)
}

/**
 * How long before the child who has played least catches up, if the coach
 * keeps swapping at this rate. Null when nobody is behind.
 */
export function projectedCatchUpMs(
  times: readonly PlayerTime[],
  fieldSize: number,
  remainingMs: number,
): number | null {
  if (!times.length || remainingMs <= 0) return null
  const totals = times.map(adjustedMs)
  const lowest = Math.min(...totals)
  const average = averageMs(times)
  if (average - lowest <= 0) return null

  // Everyone shares the remaining field-minutes evenly from here on.
  const sharePerPlayer = (remainingMs * fieldSize) / times.length
  const deficit = average - lowest
  return deficit <= sharePerPlayer ? deficit : null
}
