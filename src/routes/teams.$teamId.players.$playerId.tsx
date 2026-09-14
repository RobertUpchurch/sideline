import { useMemo } from 'react'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { playersQuery, seasonQuery, teamQuery } from '~/db/queries'
import { seasonReport } from '~/engine/reports'
import { formatClock, formatDate, formatDelta } from '~/lib/time'
import {
  Body,
  Card,
  EmptyState,
  List,
  Screen,
  SectionLabel,
  TopBar,
} from '~/components/ui'

export const Route = createFileRoute('/teams/$teamId/players/$playerId')({
  loader: async ({ context, params }) => {
    const [team] = await Promise.all([
      context.queryClient.ensureQueryData(teamQuery(params.teamId)),
      context.queryClient.ensureQueryData(playersQuery(params.teamId)),
      context.queryClient.ensureQueryData(seasonQuery(params.teamId)),
    ])
    // Same for a team that has been deleted.
    if (!team) throw notFound()
    return team
  },
  component: PlayerReport,
})

function PlayerReport() {
  const { teamId, playerId } = Route.useParams()
  const { data: players = [] } = useQuery(playersQuery(teamId))
  const { data: season = [] } = useQuery(seasonQuery(teamId))

  const finished = useMemo(
    () => season.filter((entry) => entry.game.status === 'final'),
    [season],
  )
  const report = useMemo(
    () => seasonReport(players, finished).find((entry) => entry.player.id === playerId),
    [players, finished, playerId],
  )

  if (!report) return null

  const player = report.player
  const played = report.games.filter((game) => game.totalMs !== null)
  const maxMs = Math.max(1, ...played.map((game) => game.totalMs ?? 0))
  const vsTone =
    Math.abs(report.vsTeamAverageMs) <= 60_000
      ? 'text-pitch'
      : report.vsTeamAverageMs < 0
        ? 'text-amber'
        : 'text-action'

  return (
    <Screen>
      <TopBar
        title={`${player.name}${player.number != null ? ` · ${player.number}` : ''}`}
        back={{ to: '/teams/$teamId/season', params: { teamId } }}
        backLabel="Season"
      />

      <Body className="gap-5 px-5 pt-1">
        {played.length === 0 ? (
          <EmptyState
            title={`No games for ${player.name} yet`}
            body="Once they have played a game, their minutes and how those compare with the rest of the team show up here."
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat value={formatClock(report.averageMs)} label="avg per game" />
              <Stat
                value={formatDelta(report.vsTeamAverageMs)}
                label="vs team avg"
                className={vsTone}
              />
              <Stat
                value={String(report.gamesAvailable)}
                label={report.gamesAvailable === 1 ? 'game' : 'games'}
              />
            </div>

            <Card className="flex flex-col gap-3 p-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
                  Minutes by game
                </h2>
                <span className="text-[12px] text-faint">
                  {played.length} of {report.games.length} games
                </span>
              </div>

              <div className="flex h-28 items-end gap-2">
                {report.games.map((game) => {
                  const value = game.totalMs
                  const height =
                    value === null ? 8 : Math.max(6, Math.round((112 * value) / maxMs))
                  return (
                    <div
                      key={game.gameId}
                      className="flex flex-1 flex-col items-center justify-end"
                      title={
                        value === null
                          ? `${formatDate(game.date)} — away`
                          : `${formatDate(game.date)} — ${formatClock(value)}`
                      }
                    >
                      <div
                        className={`w-full rounded-t-md ${
                          value === null ? 'bg-edge' : 'bg-pitch'
                        }`}
                        style={{ height: `${height}px` }}
                      />
                    </div>
                  )
                })}
              </div>

              <div className="flex gap-2 text-center text-[11px] text-faint">
                {report.games.map((game) => (
                  <span key={game.gameId} className="flex-1 truncate">
                    {new Date(game.date).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'numeric',
                    })}
                  </span>
                ))}
              </div>

              <p className="text-[12px] text-faint">
                Grey bars are games {player.name} missed. They do not count towards the
                average.
              </p>
            </Card>

            <div className="flex flex-col gap-2 pb-2">
              <SectionLabel>Every game</SectionLabel>
              <List>
                {[...report.games]
                  .sort((a, b) => b.date - a.date)
                  .map((game) => (
                    <div key={game.gameId} className="flex h-14 items-center gap-3 px-4">
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="truncate text-[16px] font-semibold">
                          vs {game.opponent}
                        </span>
                        <span className="text-[13px] text-faint">
                          {formatDate(game.date)}
                        </span>
                      </span>
                      <span
                        className={`cond tnum text-[20px] font-bold ${
                          game.totalMs === null ? 'text-faint' : 'text-ink'
                        }`}
                      >
                        {game.totalMs === null ? 'away' : formatClock(game.totalMs)}
                      </span>
                    </div>
                  ))}
              </List>
            </div>
          </>
        )}
      </Body>
    </Screen>
  )
}

function Stat({
  value,
  label,
  className = 'text-ink',
}: {
  value: string
  label: string
  className?: string
}) {
  return (
    <Card className="flex flex-col gap-0.5 p-3.5">
      <span className={`cond tnum text-[26px] leading-none font-extrabold ${className}`}>
        {value}
      </span>
      <span className="text-[12px] text-muted">{label}</span>
    </Card>
  )
}
