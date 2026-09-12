import { db, newId } from '~/db/schema'
import { summarizeGame } from '~/engine/reports'
import { formatClock, formatLongDate } from './time'
import type { Game, GameEvent, Id, Player, Team } from '~/engine/types'

/**
 * Backup, restore, and handing a team on to next season's coach.
 *
 * A single JSON file holds a team, its roster and every game. It is the only
 * way data leaves the phone, and it only happens when the coach asks.
 */

export const BACKUP_VERSION = 1

export interface TeamBackup {
  format: 'sideline-team'
  version: number
  exportedAt: number
  team: Team
  players: Player[]
  games: Game[]
  events: GameEvent[]
}

export async function exportTeam(teamId: Id): Promise<TeamBackup> {
  const team = await db.teams.get(teamId)
  if (!team) throw new Error('That team is no longer on this phone.')

  const players = await db.players.where('teamId').equals(teamId).toArray()
  const games = await db.games.where('teamId').equals(teamId).toArray()
  const events = (
    await Promise.all(
      games.map((game) => db.events.where('gameId').equals(game.id).toArray()),
    )
  ).flat()

  return {
    format: 'sideline-team',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    team,
    players,
    games,
    events,
  }
}

export interface ImportResult {
  teamName: string
  players: number
  games: number
  /** True when this replaced a team already on the phone. */
  replacedExisting: boolean
}

function assertBackup(value: unknown): asserts value is TeamBackup {
  const backup = value as Partial<TeamBackup> | null
  if (!backup || backup.format !== 'sideline-team') {
    throw new Error('That does not look like a Sideline backup file.')
  }
  if (typeof backup.version !== 'number' || backup.version > BACKUP_VERSION) {
    throw new Error('That backup came from a newer version of Sideline.')
  }
  if (!backup.team || !Array.isArray(backup.players) || !Array.isArray(backup.games)) {
    throw new Error('That backup file is incomplete.')
  }
}

/**
 * Restores a backup.
 *
 * Importing a team that is already here replaces it outright, which is what a
 * coach restoring their own backup expects. Importing someone else's team
 * lands alongside your own with fresh identifiers, so two coaches can swap
 * files without one overwriting the other.
 */
export async function importTeam(
  raw: unknown,
  mode: 'replace' | 'copy' = 'replace',
): Promise<ImportResult> {
  assertBackup(raw)
  const backup = raw

  const existing = await db.teams.get(backup.team.id)
  const remap = mode === 'copy'

  const idMap = new Map<Id, Id>()
  const mapId = (id: Id): Id => {
    if (!remap) return id
    let mapped = idMap.get(id)
    if (!mapped) {
      mapped = newId()
      idMap.set(id, mapped)
    }
    return mapped
  }

  const team: Team = { ...backup.team, id: mapId(backup.team.id) }
  const players = backup.players.map((player) => ({
    ...player,
    id: mapId(player.id),
    teamId: team.id,
  }))
  const games = backup.games.map((game) => ({
    ...game,
    id: mapId(game.id),
    teamId: team.id,
    presentPlayerIds: game.presentPlayerIds.map(mapId),
  }))
  const events = backup.events.map((event) => {
    const next = { ...event, id: mapId(event.id), gameId: mapId(event.gameId) }
    if (next.type === 'lineup_set') next.playerIds = next.playerIds.map(mapId)
    if (next.type === 'sub') {
      next.onPlayerId = mapId(next.onPlayerId)
      next.offPlayerId = mapId(next.offPlayerId)
    }
    return next
  })

  await db.transaction('rw', db.teams, db.players, db.games, db.events, async () => {
    if (!remap && existing) {
      const oldGames = await db.games.where('teamId').equals(team.id).toArray()
      for (const game of oldGames) {
        await db.events.where('gameId').equals(game.id).delete()
      }
      await db.games.where('teamId').equals(team.id).delete()
      await db.players.where('teamId').equals(team.id).delete()
    }
    await db.teams.put(team)
    await db.players.bulkPut(players)
    await db.games.bulkPut(games)
    await db.events.bulkPut(events)
  })

  return {
    teamName: team.name,
    players: players.length,
    games: games.length,
    replacedExisting: !remap && existing !== undefined,
  }
}

/** The minutes table for one game, as a spreadsheet a coach can email. */
export async function gameCsv(gameId: Id): Promise<string> {
  const game = await db.games.get(gameId)
  if (!game) throw new Error('That game is no longer on this phone.')
  const events = await db.events.where('gameId').equals(gameId).toArray()
  const players = await db.players.where('teamId').equals(game.teamId).toArray()
  const byId = new Map(players.map((player) => [player.id, player]))
  const summary = summarizeGame({ game, events })

  const rows: string[][] = [
    ['Player', 'Number', 'Minutes', 'Seconds played', 'Difference from average'],
  ]
  for (const time of [...summary.times].sort((a, b) => b.totalMs - a.totalMs)) {
    const player = byId.get(time.playerId)
    rows.push([
      player?.name ?? 'Unknown',
      player?.number != null ? String(player.number) : '',
      formatClock(time.totalMs),
      String(Math.round(time.totalMs / 1000)),
      formatClock(Math.abs(time.totalMs - summary.averageMs)),
    ])
  }

  const meta = [
    [`Sideline export`],
    [`Opponent`, game.opponent],
    [`Date`, formatLongDate(game.date)],
    [`Score`, `${summary.ourScore}-${summary.theirScore}`],
    [],
  ]

  return [...meta, ...rows]
    .map((row) => row.map(csvCell).join(','))
    .join('\n')
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Hands a generated file to the phone, by share sheet where there is one. */
export async function offerFile(
  filename: string,
  contents: string,
  mimeType: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([contents], filename, { type: mimeType })

  if (
    typeof navigator !== 'undefined' &&
    'canShare' in navigator &&
    navigator.canShare({ files: [file] })
  ) {
    try {
      await navigator.share({ files: [file], title: filename })
      return 'shared'
    } catch (error) {
      // The coach dismissed the sheet, or the platform refused. Fall through.
      if ((error as Error)?.name === 'AbortError') return 'shared'
    }
  }

  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}

/** A filename a coach can find again in six months. */
export function backupFilename(teamName: string): string {
  const slug = teamName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const date = new Date().toISOString().slice(0, 10)
  return `sideline-${slug || 'team'}-${date}.json`
}
