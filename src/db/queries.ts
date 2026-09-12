import { queryOptions, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  appendEvent,
  appendEvents,
  db,
  deleteGame,
  deleteTeam,
  newId,
  popLastEvent,
} from './schema'
import type { DraftGameEvent, Game, Id, Player, Team, TeamSettings } from '~/engine/types'

/**
 * Query keys, in one place so a mutation can invalidate exactly what it
 * touched rather than blowing the whole cache away mid-game.
 */
export const keys = {
  teams: ['teams'] as const,
  team: (teamId: Id) => ['teams', teamId] as const,
  players: (teamId: Id) => ['teams', teamId, 'players'] as const,
  games: (teamId: Id) => ['teams', teamId, 'games'] as const,
  game: (gameId: Id) => ['games', gameId] as const,
  events: (gameId: Id) => ['games', gameId, 'events'] as const,
  liveGame: ['live-game'] as const,
}

export const teamsQuery = () =>
  queryOptions({
    queryKey: keys.teams,
    queryFn: () => db.teams.orderBy('createdAt').toArray(),
  })

export const teamQuery = (teamId: Id) =>
  queryOptions({
    queryKey: keys.team(teamId),
    queryFn: async () => (await db.teams.get(teamId)) ?? null,
  })

export const playersQuery = (teamId: Id) =>
  queryOptions({
    queryKey: keys.players(teamId),
    queryFn: () => db.players.where('teamId').equals(teamId).sortBy('createdAt'),
  })

export const gamesQuery = (teamId: Id) =>
  queryOptions({
    queryKey: keys.games(teamId),
    queryFn: async () => {
      const games = await db.games.where('teamId').equals(teamId).toArray()
      return games.sort((a, b) => b.date - a.date)
    },
  })

export const gameQuery = (gameId: Id) =>
  queryOptions({
    queryKey: keys.game(gameId),
    queryFn: async () => (await db.games.get(gameId)) ?? null,
  })

export const eventsQuery = (gameId: Id) =>
  queryOptions({
    queryKey: keys.events(gameId),
    queryFn: async () => {
      const events = await db.events.where('gameId').equals(gameId).toArray()
      return events.sort((a, b) => a.ts - b.ts || a.seq - b.seq)
    },
  })

/** The game still in progress, if any. Drives the "resume" banner on the home screen. */
export const liveGameQuery = () =>
  queryOptions({
    queryKey: keys.liveGame,
    queryFn: async () => {
      const live = await db.games.where('status').equals('live').toArray()
      return live.sort((a, b) => b.date - a.date)[0] ?? null
    },
  })

/** Every game for a team with its full event log, for the season report. */
export const seasonQuery = (teamId: Id) =>
  queryOptions({
    queryKey: [...keys.games(teamId), 'with-events'] as const,
    queryFn: async () => {
      const games = await db.games.where('teamId').equals(teamId).toArray()
      return Promise.all(
        games
          .sort((a, b) => a.date - b.date)
          .map(async (game) => ({
            game,
            events: (await db.events.where('gameId').equals(game.id).toArray()).sort(
              (a, b) => a.ts - b.ts || a.seq - b.seq,
            ),
          })),
      )
    },
  })

// --- Mutations -------------------------------------------------------------

export function useCreateTeam() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; color: string; settings: TeamSettings }) => {
      const team: Team = {
        id: newId(),
        name: input.name,
        color: input.color,
        settings: input.settings,
        createdAt: Date.now(),
      }
      await db.teams.add(team)
      return team
    },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.teams }),
  })
}

export function useUpdateTeam(teamId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Omit<Team, 'id' | 'createdAt'>>) =>
      db.teams.update(teamId, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.teams })
      void client.invalidateQueries({ queryKey: keys.team(teamId) })
    },
  })
}

export function useDeleteTeam() {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (teamId: Id) => deleteTeam(teamId),
    onSuccess: () => client.invalidateQueries(),
  })
}

export function useAddPlayer(teamId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: { name: string; number: number | null }) => {
      const player: Player = {
        id: newId(),
        teamId,
        name: input.name,
        number: input.number,
        active: true,
        createdAt: Date.now(),
      }
      await db.players.add(player)
      return player
    },
    onSuccess: () => client.invalidateQueries({ queryKey: keys.players(teamId) }),
  })
}

export function useUpdatePlayer(teamId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: Id; patch: Partial<Omit<Player, 'id' | 'teamId'>> }) =>
      db.players.update(input.id, input.patch),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.players(teamId) }),
  })
}

export function useDeletePlayer(teamId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (playerId: Id) => db.players.delete(playerId),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.players(teamId) }),
  })
}

export function useCreateGame(teamId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      opponent: string
      date: number
      settings: TeamSettings
      presentPlayerIds: Id[]
      lineup: Id[]
    }) => {
      const game: Game = {
        id: newId(),
        teamId,
        opponent: input.opponent,
        date: input.date,
        status: 'live',
        settings: input.settings,
        presentPlayerIds: input.presentPlayerIds,
        createdAt: Date.now(),
        finalizedAt: null,
      }
      await db.games.add(game)
      await appendEvent(game.id, { type: 'lineup_set', playerIds: input.lineup })
      return game
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.games(teamId) })
      void client.invalidateQueries({ queryKey: keys.liveGame })
    },
  })
}

export function useUpdateGame(gameId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Omit<Game, 'id' | 'teamId'>>) =>
      db.games.update(gameId, patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.game(gameId) })
      void client.invalidateQueries({ queryKey: keys.liveGame })
      void client.invalidateQueries({ queryKey: keys.teams })
    },
  })
}

export function useDeleteGame(teamId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (gameId: Id) => deleteGame(gameId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: keys.games(teamId) })
      void client.invalidateQueries({ queryKey: keys.liveGame })
    },
  })
}

/**
 * Appends to the game log.
 *
 * Writes go straight through rather than being held optimistically: the log is
 * the truth, and a sub that only half-happened would be worse than a sub that
 * takes a frame longer to appear.
 */
export function useAppendEvent(gameId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (event: DraftGameEvent) => appendEvent(gameId, event),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.events(gameId) }),
  })
}

/** Writes several events as one undoable act. */
export function useAppendEvents(gameId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: (events: DraftGameEvent[]) => appendEvents(gameId, events),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.events(gameId) }),
  })
}

export function useUndoLastEvent(gameId: Id) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: () => popLastEvent(gameId),
    onSuccess: () => client.invalidateQueries({ queryKey: keys.events(gameId) }),
  })
}
