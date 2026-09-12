import Dexie, { type EntityTable } from 'dexie'
import type {
  DraftGameEvent,
  Game,
  GameEvent,
  Id,
  Player,
  Team,
  TeamSettings,
} from '~/engine/types'

/**
 * Everything lives in this browser, in IndexedDB. There is no server, no
 * account and no network call after the app is installed. A coach's roster is
 * their own business.
 */
export const db = new Dexie('sideline') as Dexie & {
  teams: EntityTable<Team, 'id'>
  players: EntityTable<Player, 'id'>
  games: EntityTable<Game, 'id'>
  events: EntityTable<GameEvent, 'id'>
}

db.version(1).stores({
  teams: 'id, createdAt',
  players: 'id, teamId, createdAt',
  games: 'id, teamId, date, status, [teamId+status]',
  events: 'id, gameId, [gameId+seq], ts',
})

export const DEFAULT_SETTINGS: TeamSettings = {
  periods: 2,
  periodMs: 15 * 60_000,
  breakMs: 5 * 60_000,
  fieldSize: 4,
  stoppageIncrementsMs: [30_000, 60_000, 120_000],
}

/**
 * How many stoppage chips the live clock will show.
 *
 * Three is what fits across the phone at a size a thumb can hit. Teams created
 * before this cap, or restored from an older backup, may carry more; the live
 * screen shows the first three and settings lets them be turned off.
 */
export const MAX_STOPPAGE_CHIPS = 3

export const TEAM_COLORS = [
  '#1B6B3A',
  '#2557B8',
  '#B8402F',
  '#D9A106',
  '#6B3FA0',
  '#101B14',
] as const

export function newId(): Id {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Appends an event to a game's log.
 *
 * The sequence number is assigned inside the transaction so two taps in the
 * same millisecond still end up in a definite order.
 */
export async function appendEvent(
  gameId: Id,
  event: DraftGameEvent,
): Promise<GameEvent> {
  return db.transaction('rw', db.events, async () => {
    const last = await db.events.where('[gameId+seq]').between([gameId, 0], [gameId, Infinity]).last()
    const { ts, ...rest } = event
    const record = {
      ...rest,
      id: newId(),
      gameId,
      seq: (last?.seq ?? 0) + 1,
      ts: ts ?? Date.now(),
    } as GameEvent
    await db.events.add(record)
    return record
  })
}

/**
 * Appends several events as one act.
 *
 * They share a timestamp and land in a single transaction, so a line change of
 * four players is either wholly applied or not at all. A half-finished
 * substitution mid-game would be worse than none.
 */
export async function appendEvents(
  gameId: Id,
  events: readonly DraftGameEvent[],
): Promise<GameEvent[]> {
  if (!events.length) return []
  return db.transaction('rw', db.events, async () => {
    const last = await db.events
      .where('[gameId+seq]')
      .between([gameId, 0], [gameId, Infinity])
      .last()
    const ts = Date.now()
    const records = events.map((event, index) => {
      const { ts: given, ...rest } = event
      return {
        ...rest,
        id: newId(),
        gameId,
        seq: (last?.seq ?? 0) + index + 1,
        ts: given ?? ts,
      } as GameEvent
    })
    await db.events.bulkAdd(records)
    return records
  })
}

/**
 * Removes the most recent act, which is how undo works during a game.
 *
 * Everything written together by `appendEvents` shares a timestamp, so undo
 * takes the whole trailing run at that instant. Otherwise undoing a four
 * player line change would take four taps and leave the lineup mangled in
 * between. Two separate taps never land on the same millisecond, so this only
 * ever groups what was meant as one action.
 */
export async function popLastEvent(gameId: Id): Promise<GameEvent[]> {
  return db.transaction('rw', db.events, async () => {
    const all = await db.events
      .where('[gameId+seq]')
      .between([gameId, 0], [gameId, Infinity])
      .toArray()
    const last = all[all.length - 1]
    if (!last) return []
    const group = all.filter((event) => event.ts === last.ts)
    await db.events.bulkDelete(group.map((event) => event.id))
    return group
  })
}

export async function deleteGame(gameId: Id): Promise<void> {
  await db.transaction('rw', db.games, db.events, async () => {
    await db.events.where('gameId').equals(gameId).delete()
    await db.games.delete(gameId)
  })
}

export async function deleteTeam(teamId: Id): Promise<void> {
  await db.transaction('rw', db.teams, db.players, db.games, db.events, async () => {
    const games = await db.games.where('teamId').equals(teamId).toArray()
    for (const game of games) {
      await db.events.where('gameId').equals(game.id).delete()
    }
    await db.games.where('teamId').equals(teamId).delete()
    await db.players.where('teamId').equals(teamId).delete()
    await db.teams.delete(teamId)
  })
}
