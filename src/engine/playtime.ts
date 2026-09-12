import { eventsUpTo, runSegments, runningMsBetween, sortEvents, type RunSegment } from './clock'
import type { GameEvent, Id, PlayerTime } from './types'

interface LineupChange {
  ts: number
  lineup: ReadonlySet<Id>
}

/**
 * Who was on the field, and from when.
 *
 * A lineup is set outright before each period and nudged by substitutions in
 * between. Both are folded into one timeline so playing time can be measured
 * against it.
 */
export function lineupTimeline(events: readonly GameEvent[]): LineupChange[] {
  const ordered = sortEvents(events)
  const changes: LineupChange[] = []
  let current = new Set<Id>()

  const record = (ts: number, lineup: Set<Id>) => {
    const last = changes[changes.length - 1]
    if (last && last.ts === ts) changes[changes.length - 1] = { ts, lineup }
    else changes.push({ ts, lineup })
  }

  for (const event of ordered) {
    if (event.type === 'lineup_set') {
      current = new Set(event.playerIds)
      record(event.ts, current)
    } else if (event.type === 'sub') {
      current = new Set(current)
      current.delete(event.offPlayerId)
      current.add(event.onPlayerId)
      record(event.ts, current)
    }
  }

  return changes
}

/** The lineup in force at `at`. */
export function lineupAt(changes: readonly LineupChange[], at: number): ReadonlySet<Id> {
  let lineup: ReadonlySet<Id> = new Set<Id>()
  for (const change of changes) {
    if (change.ts <= at) lineup = change.lineup
    else break
  }
  return lineup
}

/** The lineup as it stands now. */
export function currentLineup(events: readonly GameEvent[]): ReadonlySet<Id> {
  const changes = lineupTimeline(events)
  return changes.length ? changes[changes.length - 1]!.lineup : new Set<Id>()
}

function totalsByPlayer(
  segments: readonly RunSegment[],
  changes: readonly LineupChange[],
): Map<Id, number> {
  const totals = new Map<Id, number>()
  if (!changes.length) return totals

  for (const segment of segments) {
    // Walk the lineup changes that overlap this running segment.
    let cursor = segment.start
    let index = 0
    while (index < changes.length && changes[index]!.ts <= segment.start) index += 1
    let lineup = index > 0 ? changes[index - 1]!.lineup : new Set<Id>()

    while (cursor < segment.end) {
      const nextChange = changes[index]
      const boundary =
        nextChange && nextChange.ts < segment.end ? nextChange.ts : segment.end
      const span = boundary - cursor
      if (span > 0) {
        for (const playerId of lineup) {
          totals.set(playerId, (totals.get(playerId) ?? 0) + span)
        }
      }
      cursor = boundary
      if (nextChange && nextChange.ts < segment.end) {
        lineup = nextChange.lineup
        index += 1
      }
    }
  }

  return totals
}

/**
 * When each player's current stretch on or off the field began.
 *
 * Used for the current stint and for how long a child has been sitting, which
 * is what breaks ties when two of them have played exactly the same amount.
 */
function statusSince(
  changes: readonly LineupChange[],
  playerIds: readonly Id[],
  firstRunTs: number | null,
): Map<Id, number> {
  const since = new Map<Id, number>()
  const start = firstRunTs ?? (changes.length ? changes[0]!.ts : 0)
  for (const playerId of playerIds) since.set(playerId, start)

  let previous: ReadonlySet<Id> | null = null
  for (const change of changes) {
    if (previous) {
      for (const playerId of playerIds) {
        const wasOn = previous.has(playerId)
        const isOn = change.lineup.has(playerId)
        if (wasOn !== isOn) since.set(playerId, change.ts)
      }
    }
    previous = change.lineup
  }

  return since
}

/** Children who arrived after kick off, and the handicap each was given. */
export function lateArrivals(events: readonly GameEvent[]): Map<Id, { ts: number; creditMs: number }> {
  const arrivals = new Map<Id, { ts: number; creditMs: number }>()
  for (const event of events) {
    if (event.type === 'player_joined' && !arrivals.has(event.playerId)) {
      arrivals.set(event.playerId, { ts: event.ts, creditMs: event.creditMs })
    }
  }
  return arrivals
}

/**
 * Everyone taking part, in the order they joined the game.
 *
 * Derived rather than read off the game record so that undoing a late
 * arrival actually removes them again.
 */
export function presentPlayerIds(
  startingIds: readonly Id[],
  events: readonly GameEvent[],
): Id[] {
  const ids = [...startingIds]
  for (const playerId of lateArrivals(events).keys()) {
    if (!ids.includes(playerId)) ids.push(playerId)
  }
  return ids
}

/**
 * Playing time for every available player, as of `now`.
 *
 * Time only accrues while the clock is running, so a substitution made during
 * halftime or a stoppage costs nobody anything. A child who arrived late
 * accrues nothing before they got there, and carries the handicap they were
 * given separately from what they actually played.
 */
export function derivePlaytime(
  events: readonly GameEvent[],
  playerIds: readonly Id[],
  now: number,
): PlayerTime[] {
  const ordered = eventsUpTo(events, now)
  const segments = runSegments(ordered, now)
  const changes = lineupTimeline(ordered)
  const totals = totalsByPlayer(segments, changes)
  const onField = changes.length ? changes[changes.length - 1]!.lineup : new Set<Id>()
  const firstRunTs = segments.length ? segments[0]!.start : null
  const arrivals = lateArrivals(ordered)
  const roster = presentPlayerIds(playerIds, ordered)
  const since = statusSince(changes, roster, firstRunTs)

  return roster.map((playerId) => {
    const isOn = onField.has(playerId)
    const arrival = arrivals.get(playerId)
    // A late arrival has not been sitting out since kick off; they have been
    // sitting out since they walked up.
    const baseline = arrival ? Math.max(since.get(playerId) ?? 0, arrival.ts) : since.get(playerId)
    const sinceTs = baseline ?? firstRunTs ?? now
    const sinceMs = runningMsBetween(segments, sinceTs, now)
    return {
      playerId,
      totalMs: totals.get(playerId) ?? 0,
      creditMs: arrival?.creditMs ?? 0,
      onField: isOn,
      currentStintMs: isOn ? sinceMs : 0,
      benchMs: isOn ? 0 : sinceMs,
    }
  })
}

/** The score, as `[us, them]`. */
export function deriveScore(events: readonly GameEvent[]): [number, number] {
  let us = 0
  let them = 0
  for (const event of events) {
    if (event.type === 'goal_us') us += 1
    else if (event.type === 'goal_them') them += 1
  }
  return [us, them]
}
