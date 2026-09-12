import { describe, expect, it } from 'vitest'
import { deriveClock, nextPeriod, runSegments } from './clock'
import { currentLineup, deriveScore, derivePlaytime } from './playtime'
import {
  adjustedMs,
  averageMs,
  benchOrder,
  fieldOrder,
  lineupForNextPeriod,
  playedMs,
  spreadMs,
  suggestLineup,
  suggestSwap,
} from './fairness'
import { seasonReport, summarizeGame } from './reports'
import type { DraftGameEvent, Game, GameEvent, Player, TeamSettings } from './types'

const MIN = 60_000
const T0 = 1_700_000_000_000

const settings: TeamSettings = {
  periods: 2,
  periodMs: 15 * MIN,
  breakMs: 5 * MIN,
  fieldSize: 4,
  stoppageIncrementsMs: [30_000, MIN],
}

/** Builds events with sequential seq numbers so ordering is never ambiguous. */
function log() {
  let seq = 0
  const events: GameEvent[] = []
  const push = (ts: number, rest: DraftGameEvent) => {
    seq += 1
    events.push({ ...rest, id: `e${seq}`, gameId: 'g1', seq, ts } as GameEvent)
    return api
  }
  const api = {
    events,
    lineup: (ts: number, playerIds: string[]) => push(ts, { type: 'lineup_set', playerIds }),
    start: (ts: number, period: number) => push(ts, { type: 'period_start', period }),
    pause: (ts: number) => push(ts, { type: 'pause' }),
    resume: (ts: number) => push(ts, { type: 'resume' }),
    end: (ts: number, period: number) => push(ts, { type: 'period_end', period }),
    stoppage: (ts: number, period: number, ms: number) =>
      push(ts, { type: 'stoppage_added', period, ms }),
    sub: (ts: number, onPlayerId: string, offPlayerId: string) =>
      push(ts, { type: 'sub', onPlayerId, offPlayerId }),
    joined: (ts: number, playerId: string, creditMs: number) =>
      push(ts, { type: 'player_joined', playerId, creditMs }),
    goalUs: (ts: number) => push(ts, { type: 'goal_us' }),
    goalThem: (ts: number) => push(ts, { type: 'goal_them' }),
    gameEnd: (ts: number) => push(ts, { type: 'game_end' }),
  }
  return api
}

describe('clock', () => {
  it('is idle before the coach starts the first period', () => {
    const clock = deriveClock([], settings, T0)
    expect(clock.phase).toBe('pregame')
    expect(clock.elapsedMs).toBe(0)
    expect(clock.remainingMs).toBe(15 * MIN)
    expect(nextPeriod(clock, settings)).toBe(1)
  })

  it('counts down from the whistle', () => {
    const { events } = log().start(T0, 1)
    const clock = deriveClock(events, settings, T0 + 7 * MIN)
    expect(clock.phase).toBe('running')
    expect(clock.elapsedMs).toBe(7 * MIN)
    expect(clock.remainingMs).toBe(8 * MIN)
  })

  it('stops accruing while paused and resumes where it left off', () => {
    const { events } = log().start(T0, 1).pause(T0 + 5 * MIN).resume(T0 + 9 * MIN)
    const during = deriveClock(events, settings, T0 + 7 * MIN)
    expect(during.phase).toBe('paused')
    expect(during.elapsedMs).toBe(5 * MIN)

    const after = deriveClock(events, settings, T0 + 11 * MIN)
    expect(after.phase).toBe('running')
    expect(after.elapsedMs).toBe(7 * MIN)
    expect(after.remainingMs).toBe(8 * MIN)
  })

  it('adds stoppage time to the period it belongs to', () => {
    const { events } = log().start(T0, 1).stoppage(T0 + 10 * MIN, 1, 90_000)
    const clock = deriveClock(events, settings, T0 + 15 * MIN)
    expect(clock.stoppageMs).toBe(90_000)
    expect(clock.periodLengthMs).toBe(15 * MIN + 90_000)
    expect(clock.remainingMs).toBe(90_000)
  })

  it('never shows negative time when the coach lets a period run over', () => {
    const { events } = log().start(T0, 1)
    const clock = deriveClock(events, settings, T0 + 18 * MIN)
    expect(clock.remainingMs).toBe(0)
    expect(clock.elapsedMs).toBe(18 * MIN)
  })

  it('counts the break down from the moment the half ends', () => {
    const { events } = log().start(T0, 1).end(T0 + 15 * MIN, 1)
    const clock = deriveClock(events, settings, T0 + 17 * MIN)
    expect(clock.phase).toBe('break')
    expect(clock.breakRemainingMs).toBe(3 * MIN)
    expect(nextPeriod(clock, settings)).toBe(2)
  })

  it('starts the second half fresh, stoppage and all', () => {
    const { events } = log()
      .start(T0, 1)
      .stoppage(T0 + 5 * MIN, 1, 60_000)
      .end(T0 + 16 * MIN, 1)
      .start(T0 + 21 * MIN, 2)
    const clock = deriveClock(events, settings, T0 + 25 * MIN)
    expect(clock.period).toBe(2)
    expect(clock.elapsedMs).toBe(4 * MIN)
    expect(clock.stoppageMs).toBe(0)
    expect(clock.remainingMs).toBe(11 * MIN)
  })

  it('is complete once the final period ends', () => {
    const { events } = log()
      .start(T0, 1)
      .end(T0 + 15 * MIN, 1)
      .start(T0 + 20 * MIN, 2)
      .end(T0 + 35 * MIN, 2)
    const clock = deriveClock(events, settings, T0 + 40 * MIN)
    expect(clock.phase).toBe('final')
    expect(clock.isComplete).toBe(true)
    expect(nextPeriod(clock, settings)).toBeNull()
  })

  it('matches the wall clock after the app is killed and reopened mid-half', () => {
    // The coach starts the half, locks the phone, and comes back 9 minutes later.
    // Nothing ticked in between; the answer still has to be right.
    const { events } = log().start(T0, 1)
    const reopened = deriveClock(events, settings, T0 + 9 * MIN + 13_000)
    expect(reopened.elapsedMs).toBe(9 * MIN + 13_000)
    expect(reopened.remainingMs).toBe(5 * MIN + 47_000)
  })

  it('stops the clock at the final whistle even if time passes afterwards', () => {
    const { events } = log().start(T0, 1).gameEnd(T0 + 12 * MIN)
    const segments = runSegments(events, T0 + 30 * MIN)
    const total = segments.reduce((sum, s) => sum + (s.end - s.start), 0)
    expect(total).toBe(12 * MIN)
  })
})

describe('playtime', () => {
  const roster = ['a', 'b', 'c', 'd', 'e']

  it('accrues time only for the children on the field', () => {
    const { events } = log().lineup(T0, ['a', 'b', 'c', 'd']).start(T0, 1)
    const times = derivePlaytime(events, roster, T0 + 6 * MIN)
    const byId = Object.fromEntries(times.map((t) => [t.playerId, t]))

    expect(byId.a!.totalMs).toBe(6 * MIN)
    expect(byId.a!.onField).toBe(true)
    expect(byId.a!.currentStintMs).toBe(6 * MIN)
    expect(byId.e!.totalMs).toBe(0)
    expect(byId.e!.onField).toBe(false)
    expect(byId.e!.benchMs).toBe(6 * MIN)
  })

  it('splits time correctly across a substitution', () => {
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .sub(T0 + 4 * MIN, 'e', 'a')
    const times = derivePlaytime(events, roster, T0 + 10 * MIN)
    const byId = Object.fromEntries(times.map((t) => [t.playerId, t]))

    expect(byId.a!.totalMs).toBe(4 * MIN)
    expect(byId.a!.onField).toBe(false)
    expect(byId.a!.benchMs).toBe(6 * MIN)
    expect(byId.e!.totalMs).toBe(6 * MIN)
    expect(byId.e!.currentStintMs).toBe(6 * MIN)
  })

  it('gives nobody time for a substitution made while the clock is paused', () => {
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .pause(T0 + 5 * MIN)
      .sub(T0 + 6 * MIN, 'e', 'a')
      .resume(T0 + 8 * MIN)
    const times = derivePlaytime(events, roster, T0 + 10 * MIN)
    const byId = Object.fromEntries(times.map((t) => [t.playerId, t]))

    // Five minutes of play, then three minutes of stopped clock, then two more.
    expect(byId.a!.totalMs).toBe(5 * MIN)
    expect(byId.e!.totalMs).toBe(2 * MIN)
    expect(byId.b!.totalMs).toBe(7 * MIN)
  })

  it('gives nobody time for a substitution made at halftime', () => {
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .end(T0 + 15 * MIN, 1)
      .lineup(T0 + 17 * MIN, ['e', 'b', 'c', 'd'])
      .start(T0 + 20 * MIN, 2)
    const times = derivePlaytime(events, roster, T0 + 25 * MIN)
    const byId = Object.fromEntries(times.map((t) => [t.playerId, t]))

    expect(byId.a!.totalMs).toBe(15 * MIN)
    expect(byId.e!.totalMs).toBe(5 * MIN)
    expect(byId.b!.totalMs).toBe(20 * MIN)
  })

  it('applies a whole line change as one swap', () => {
    // Four off and four on at the same instant, which is the normal way a
    // coach at this age group makes a change.
    const roster8 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
    const builder = log().lineup(T0, ['a', 'b', 'c', 'd']).start(T0, 1)
    const at = T0 + 5 * MIN
    builder.sub(at, 'e', 'a')
    builder.sub(at, 'f', 'b')
    builder.sub(at, 'g', 'c')
    builder.sub(at, 'h', 'd')

    expect([...currentLineup(builder.events)].sort()).toEqual(['e', 'f', 'g', 'h'])

    const times = derivePlaytime(builder.events, roster8, T0 + 12 * MIN)
    const byId = Object.fromEntries(times.map((t) => [t.playerId, t]))

    // The starters stop exactly when the replacements start. No child is
    // credited for a lineup that was only ever momentary.
    expect(byId.a!.totalMs).toBe(5 * MIN)
    expect(byId.e!.totalMs).toBe(7 * MIN)
    const played = times.reduce((sum, t) => sum + t.totalMs, 0)
    expect(played).toBe(4 * 12 * MIN)
  })

  it('tracks the current lineup through subs', () => {
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .sub(T0 + 3 * MIN, 'e', 'a')
    expect([...currentLineup(events)].sort()).toEqual(['b', 'c', 'd', 'e'])
  })

  it('reads the score off the log', () => {
    const { events } = log().goalUs(T0).goalThem(T0 + MIN).goalUs(T0 + 2 * MIN)
    expect(deriveScore(events)).toEqual([2, 1])
  })
})

describe('fairness', () => {
  const roster = ['a', 'b', 'c', 'd', 'e']

  it('puts the child who has played least at the top of the bench', () => {
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .sub(T0 + 5 * MIN, 'e', 'a')
      .sub(T0 + 8 * MIN, 'a', 'b')
    const times = derivePlaytime(events, roster, T0 + 10 * MIN)
    const bench = benchOrder(times)
    expect(bench[0]!.playerId).toBe('b')
  })

  it('breaks a tie in favour of whoever has been sitting longer', () => {
    // c and d both end on six minutes, but d has been off the field since the
    // sixth minute and c only since the ninth.
    const roster6 = ['a', 'b', 'c', 'd', 'e', 'f']
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .sub(T0 + 3 * MIN, 'e', 'c')
      .sub(T0 + 6 * MIN, 'c', 'd')
      .sub(T0 + 9 * MIN, 'f', 'c')
    const times = derivePlaytime(events, roster6, T0 + 12 * MIN)
    const byId = Object.fromEntries(times.map((t) => [t.playerId, t]))

    expect(byId.c!.totalMs).toBe(6 * MIN)
    expect(byId.d!.totalMs).toBe(6 * MIN)
    expect(byId.d!.benchMs).toBe(6 * MIN)
    expect(byId.c!.benchMs).toBe(3 * MIN)
    expect(benchOrder(times)[0]!.playerId).toBe('d')
  })

  it('puts the busiest child at the top of the field, ready to come off', () => {
    // The field reads top-down as who to take off next, so it mirrors the
    // bench, which reads top-down as who to bring on.
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .sub(T0 + 4 * MIN, 'e', 'c')
      .sub(T0 + 6 * MIN, 'c', 'd')
    const times = derivePlaytime(events, roster, T0 + 10 * MIN)
    const byId = Object.fromEntries(times.map((t) => [t.playerId, t]))

    // a and b never came off, c played four then came back at six, e came on
    // at four and has been there since.
    expect(byId.a!.totalMs).toBe(10 * MIN)
    expect(byId.c!.totalMs).toBe(8 * MIN)
    expect(byId.e!.totalMs).toBe(6 * MIN)

    expect(fieldOrder(times).map((t) => t.playerId)).toEqual(['a', 'b', 'c', 'e'])
    // The top of the field is exactly who the app would take off.
    expect(fieldOrder(times)[0]!.playerId).toBe(suggestSwap(times)!.offPlayerId)
  })

  it('suggests taking off the busiest child for the quietest one', () => {
    const { events } = log().lineup(T0, ['a', 'b', 'c', 'd']).start(T0, 1)
    const times = derivePlaytime(events, roster, T0 + 10 * MIN)
    const swap = suggestSwap(times)
    expect(swap).not.toBeNull()
    expect(swap!.onPlayerId).toBe('e')
    expect(swap!.gapMs).toBe(10 * MIN)
  })

  it('suggests nothing when everyone is already level', () => {
    const times = roster.map((playerId) => ({
      playerId,
      totalMs: 5 * MIN,
      creditMs: 0,
      onField: playerId !== 'e',
      currentStintMs: 0,
      benchMs: 0,
    }))
    expect(suggestSwap(times)).toBeNull()
  })

  it('opens the next period with the children who have played least', () => {
    const { events } = log().lineup(T0, ['a', 'b', 'c', 'd']).start(T0, 1)
    const times = derivePlaytime(events, roster, T0 + 10 * MIN)
    expect(suggestLineup(times, 4)).toContain('e')
  })

  it('starts the next period with the lineup the coach was shown', () => {
    // The break screen pre-selects the fairest four. A coach who taps start
    // without touching anything must get those four, not the ones already on.
    const { events } = log().lineup(T0, ['a', 'b', 'c', 'd']).start(T0, 1).end(T0 + 15 * MIN, 1)
    const times = derivePlaytime(events, roster, T0 + 16 * MIN)

    const untouched = lineupForNextPeriod(null, times, 4)
    expect(untouched).toEqual(suggestLineup(times, 4))
    expect(untouched).toContain('e')

    const edited = lineupForNextPeriod(['a', 'b', 'c', 'e'], times, 4)
    expect(edited).toEqual(['a', 'b', 'c', 'e'])

    // A half-finished choice is not a lineup; fall back rather than mislead.
    expect(lineupForNextPeriod(['a', 'b'], times, 4)).toEqual(suggestLineup(times, 4))
  })

  it('slots a late arrival into the middle rather than the front of the queue', () => {
    // Four play the first eight minutes. A fifth child turns up and is
    // credited the eight minutes the others have had.
    const { events } = log().lineup(T0, ['a', 'b', 'c', 'd']).start(T0, 1)
    const before = derivePlaytime(events, ['a', 'b', 'c', 'd'], T0 + 8 * MIN)
    const credit = averageMs(before)
    expect(credit).toBe(8 * MIN)

    const builder = log()
    builder.lineup(T0, ['a', 'b', 'c', 'd'])
    builder.start(T0, 1)
    builder.joined(T0 + 8 * MIN, 'e', credit)

    const after = derivePlaytime(builder.events, ['a', 'b', 'c', 'd'], T0 + 8 * MIN)
    const late = after.find((t) => t.playerId === 'e')!

    // On the field they have played nothing, but they count as level.
    expect(late.totalMs).toBe(0)
    expect(late.creditMs).toBe(8 * MIN)
    expect(adjustedMs(late)).toBe(8 * MIN)

    // So they do not jump the whole bench the moment they arrive.
    expect(benchOrder(after).map((t) => t.playerId)).toEqual(['e'])
    expect(suggestSwap(after)).toBeNull()
  })

  it('does not count a late arrival as having sat out since kick off', () => {
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .joined(T0 + 8 * MIN, 'e', 8 * MIN)
    const times = derivePlaytime(events, ['a', 'b', 'c', 'd'], T0 + 12 * MIN)
    const late = times.find((t) => t.playerId === 'e')!
    expect(late.benchMs).toBe(4 * MIN)
  })

  it('reports what a late arrival actually played, not their handicap', () => {
    const { events } = log()
      .lineup(T0, ['a', 'b', 'c', 'd'])
      .start(T0, 1)
      .joined(T0 + 8 * MIN, 'e', 8 * MIN)
      .sub(T0 + 8 * MIN, 'e', 'a')
    const times = derivePlaytime(events, ['a', 'b', 'c', 'd'], T0 + 14 * MIN)
    const late = times.find((t) => t.playerId === 'e')!

    expect(late.totalMs).toBe(6 * MIN)
    expect(adjustedMs(late)).toBe(14 * MIN)
    // The season record must never inherit the handicap.
    expect(averageMs(times, playedMs)).toBeLessThan(averageMs(times))
  })

  it('forgets a late arrival entirely when the join is undone', () => {
    const builder = log().lineup(T0, ['a', 'b', 'c', 'd']).start(T0, 1)
    builder.joined(T0 + 8 * MIN, 'e', 8 * MIN)
    expect(derivePlaytime(builder.events, ['a', 'b', 'c', 'd'], T0 + 9 * MIN)).toHaveLength(5)

    builder.events.pop()
    expect(derivePlaytime(builder.events, ['a', 'b', 'c', 'd'], T0 + 9 * MIN)).toHaveLength(4)
  })

  it('keeps five children within one sub interval over a full game', () => {
    // Two 15-minute halves, four on the field, swapping the suggested pair
    // every three minutes. Nobody should end more than one shift adrift.
    const builder = log()
    const roster5 = ['a', 'b', 'c', 'd', 'e']
    builder.lineup(T0, ['a', 'b', 'c', 'd'])

    let clockTs = T0
    for (let period = 1; period <= 2; period += 1) {
      const periodStart = clockTs
      builder.start(periodStart, period)
      for (let minute = 3; minute < 15; minute += 3) {
        const at = periodStart + minute * MIN
        const times = derivePlaytime(builder.events, roster5, at)
        const swap = suggestSwap(times)
        if (swap) builder.sub(at, swap.onPlayerId, swap.offPlayerId)
      }
      const periodEnd = periodStart + 15 * MIN
      builder.end(periodEnd, period)
      clockTs = periodEnd + 5 * MIN
    }

    const finalTimes = derivePlaytime(builder.events, roster5, clockTs)
    const totals = finalTimes.map((t) => t.totalMs)
    expect(totals.reduce((a, b) => a + b, 0)).toBe(4 * 30 * MIN)
    expect(spreadMs(finalTimes)).toBeLessThanOrEqual(3 * MIN)
  })

  it('keeps nine children close over a full game, the real kindergarten case', () => {
    const builder = log()
    const roster9 = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']
    builder.lineup(T0, ['a', 'b', 'c', 'd'])

    let clockTs = T0
    for (let period = 1; period <= 2; period += 1) {
      const periodStart = clockTs
      builder.start(periodStart, period)
      for (let minute = 2; minute < 15; minute += 2) {
        const at = periodStart + minute * MIN
        // Two swaps per stoppage, which is what a coach actually does.
        for (let i = 0; i < 2; i += 1) {
          const times = derivePlaytime(builder.events, roster9, at)
          const swap = suggestSwap(times)
          if (swap) builder.sub(at, swap.onPlayerId, swap.offPlayerId)
        }
      }
      const periodEnd = periodStart + 15 * MIN
      builder.end(periodEnd, period)
      clockTs = periodEnd + 5 * MIN
    }

    const finalTimes = derivePlaytime(builder.events, roster9, clockTs)
    expect(spreadMs(finalTimes)).toBeLessThanOrEqual(4 * MIN)
  })
})

describe('reports', () => {
  const players: Player[] = ['a', 'b', 'c', 'd', 'e'].map((id, index) => ({
    id,
    teamId: 't1',
    name: id.toUpperCase(),
    number: index + 1,
    active: true,
    createdAt: T0,
  }))

  function finishedGame(id: string, date: number, absent: string[] = []) {
    const present = players.map((p) => p.id).filter((p) => !absent.includes(p))
    const builder = log()
    builder.lineup(date, present.slice(0, 4))
    builder.start(date, 1)
    builder.goalUs(date + 5 * MIN)
    builder.goalThem(date + 7 * MIN)
    builder.end(date + 15 * MIN, 1)
    builder.start(date + 20 * MIN, 2)
    builder.end(date + 35 * MIN, 2)

    const game: Game = {
      id,
      teamId: 't1',
      opponent: 'Blue Sharks',
      date,
      status: 'final',
      settings,
      presentPlayerIds: present,
      createdAt: date,
      finalizedAt: date + 35 * MIN,
    }
    return { game, events: builder.events }
  }

  it('summarises a finished game', () => {
    const summary = summarizeGame(finishedGame('g1', T0))
    expect(summary.ourScore).toBe(1)
    expect(summary.theirScore).toBe(1)
    expect(summary.result).toBe('draw')
    expect(summary.times).toHaveLength(5)
  })

  it('does not count a game a child missed against their average', () => {
    const games = [finishedGame('g1', T0), finishedGame('g2', T0 + 7 * 24 * 3600_000, ['e'])]
    const report = seasonReport(players, games)
    const eReport = report.find((entry) => entry.player.id === 'e')!

    expect(eReport.gamesAvailable).toBe(1)
    expect(eReport.gamesMissed).toBe(1)
    expect(eReport.games[1]!.totalMs).toBeNull()
    // The average is over the one game E was there for, not diluted by the miss.
    expect(eReport.averageMs).toBe(eReport.totalMs)
  })
})
