import { deriveScore, derivePlaytime } from './playtime'
import { deriveClock } from './clock'
import { averageMs, spreadMs } from './fairness'
import type { Game, GameEvent, Id, Player, PlayerTime } from './types'

export interface GameWithEvents {
  game: Game
  events: GameEvent[]
}

export interface GameSummary {
  gameId: Id
  opponent: string
  date: number
  ourScore: number
  theirScore: number
  /** Positive when we won, zero for a draw, negative for a loss. */
  result: 'win' | 'draw' | 'loss'
  times: PlayerTime[]
  averageMs: number
  spreadMs: number
}

/** Everything the full-time screen and the season list need about one game. */
export function summarizeGame({ game, events }: GameWithEvents): GameSummary {
  const clock = deriveClock(events, game.settings, Date.now())
  const endTs = clock.isComplete ? lastEventTs(events) : Date.now()
  const times = derivePlaytime(events, game.presentPlayerIds, endTs)
  const [ourScore, theirScore] = deriveScore(events)

  return {
    gameId: game.id,
    opponent: game.opponent,
    date: game.date,
    ourScore,
    theirScore,
    result: ourScore > theirScore ? 'win' : ourScore < theirScore ? 'loss' : 'draw',
    times,
    averageMs: averageMs(times),
    spreadMs: spreadMs(times),
  }
}

function lastEventTs(events: readonly GameEvent[]): number {
  return events.reduce((latest, event) => Math.max(latest, event.ts), 0)
}

export interface PlayerSeasonGame {
  gameId: Id
  opponent: string
  date: number
  /** Null when the child was not available for that game. */
  totalMs: number | null
}

export interface PlayerSeasonReport {
  player: Player
  gamesAvailable: number
  gamesMissed: number
  totalMs: number
  averageMs: number
  /** This player's average minus the team's average across the same games. */
  vsTeamAverageMs: number
  games: PlayerSeasonGame[]
}

/**
 * Season figures per player.
 *
 * The comparison that matters to a coach is a child's average against the
 * team's average over the games that child was actually available for — a kid
 * who missed three games should not look short-changed.
 */
export function seasonReport(
  players: readonly Player[],
  finished: readonly GameWithEvents[],
): PlayerSeasonReport[] {
  const summaries = finished
    .filter((entry) => entry.game.status === 'final')
    .map(summarizeGame)
    .sort((a, b) => a.date - b.date)

  const byGame = new Map(summaries.map((summary) => [summary.gameId, summary]))

  return players.map((player) => {
    const games: PlayerSeasonGame[] = summaries.map((summary) => {
      const time = summary.times.find((entry) => entry.playerId === player.id)
      return {
        gameId: summary.gameId,
        opponent: summary.opponent,
        date: summary.date,
        totalMs: time ? time.totalMs : null,
      }
    })

    const played = games.filter((entry) => entry.totalMs !== null)
    const totalMs = played.reduce((sum, entry) => sum + (entry.totalMs ?? 0), 0)
    const averageMsForPlayer = played.length ? totalMs / played.length : 0

    const teamAverageOverSameGames = played.length
      ? played.reduce(
          (sum, entry) => sum + (byGame.get(entry.gameId)?.averageMs ?? 0),
          0,
        ) / played.length
      : 0

    return {
      player,
      gamesAvailable: played.length,
      gamesMissed: games.length - played.length,
      totalMs,
      averageMs: averageMsForPlayer,
      vsTeamAverageMs: averageMsForPlayer - teamAverageOverSameGames,
      games,
    }
  })
}

export interface SeasonTotals {
  games: number
  averageMsPerPlayer: number
  /** Median per-game spread — the honest headline for "is this fair?". */
  typicalSpreadMs: number
}

export function seasonTotals(finished: readonly GameWithEvents[]): SeasonTotals {
  const summaries = finished
    .filter((entry) => entry.game.status === 'final')
    .map(summarizeGame)

  if (!summaries.length) {
    return { games: 0, averageMsPerPlayer: 0, typicalSpreadMs: 0 }
  }

  const averages = summaries.map((summary) => summary.averageMs)
  const spreads = [...summaries.map((summary) => summary.spreadMs)].sort(
    (a, b) => a - b,
  )
  const middle = Math.floor(spreads.length / 2)
  const typicalSpreadMs =
    spreads.length % 2 === 0
      ? ((spreads[middle - 1] ?? 0) + (spreads[middle] ?? 0)) / 2
      : (spreads[middle] ?? 0)

  return {
    games: summaries.length,
    averageMsPerPlayer:
      averages.reduce((sum, value) => sum + value, 0) / averages.length,
    typicalSpreadMs,
  }
}
