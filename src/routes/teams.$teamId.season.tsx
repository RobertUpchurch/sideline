import { useMemo, useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { playersQuery, seasonQuery, teamQuery } from '~/db/queries'
import { seasonReport, seasonTotals, summarizeGame } from '~/engine/reports'
import { importTeam } from '~/lib/transfer'
import { formatClock, formatDate, formatDelta } from '~/lib/time'
import { DataTable, type Columns } from '~/components/DataTable'
import {
  Button,
  Card,
  ChevronRightIcon,
  EmptyState,
  LinkButton,
  List,
  Screen,
  SectionLabel,
  TopBar,
} from '~/components/ui'

export const Route = createFileRoute('/teams/$teamId/season')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(teamQuery(params.teamId)),
      context.queryClient.ensureQueryData(playersQuery(params.teamId)),
      context.queryClient.ensureQueryData(seasonQuery(params.teamId)),
    ]),
  component: Season,
})

/** A row in the season table. A type alias, for the reason given in the game summary. */
type SeasonRow = {
  playerId: string
  name: string
  games: number
  averageMs: number
  vsTeamMs: number
  goals: number
}

function Season() {
  const { teamId } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: team } = useQuery(teamQuery(teamId))
  const { data: players = [] } = useQuery(playersQuery(teamId))
  const { data: season = [] } = useQuery(seasonQuery(teamId))
  const [tab, setTab] = useState<'games' | 'players'>('games')
  const [restoreError, setRestoreError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const finished = useMemo(
    () => season.filter((entry) => entry.game.status === 'final'),
    [season],
  )
  const totals = useMemo(() => seasonTotals(finished), [finished])
  const report = useMemo(() => seasonReport(players, finished), [players, finished])

  const rows = useMemo<SeasonRow[]>(
    () =>
      report
        .filter((entry) => entry.gamesAvailable > 0)
        .map((entry) => ({
          playerId: entry.player.id,
          name: entry.player.name,
          games: entry.gamesAvailable,
          averageMs: entry.averageMs,
          vsTeamMs: entry.vsTeamAverageMs,
          goals: entry.goals,
        })),
    [report],
  )

  const columns = useMemo<Columns<SeasonRow>>(
    () => [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: 'Player',
        sortFn: 'basic',
        cell: (info) => (
          <Link
            to="/teams/$teamId/players/$playerId"
            params={{ teamId, playerId: info.row.original.playerId }}
            className="text-[16px] font-semibold text-ink no-underline"
          >
            {String(info.getValue())}
          </Link>
        ),
      },
      {
        id: 'games',
        accessorFn: (row) => row.games,
        header: 'Games',
        sortFn: 'basic',
        cell: (info) => (
          <span className="cond tnum text-[17px] font-bold text-muted">
            {String(info.getValue())}
          </span>
        ),
      },
      {
        id: 'average',
        accessorFn: (row) => row.averageMs,
        header: 'Avg',
        sortFn: 'basic',
        cell: (info) => (
          <span className="cond tnum text-[18px] font-bold">
            {formatClock(Number(info.getValue()))}
          </span>
        ),
      },
      {
        id: 'vsTeam',
        accessorFn: (row) => row.vsTeamMs,
        header: 'vs team',
        sortFn: 'basic',
        cell: (info) => {
          const value = Number(info.getValue())
          const color =
            Math.abs(value) <= 60_000
              ? 'text-pitch'
              : value < 0
                ? 'text-amber'
                : 'text-action'
          return (
            <span className={`tnum text-[14px] font-semibold ${color}`}>
              {formatDelta(value)}
            </span>
          )
        },
      },
    ],
    [teamId],
  )

  const handleRestore = async (file: File) => {
    setRestoreError(null)
    try {
      const text = await file.text()
      await importTeam(JSON.parse(text) as unknown, 'replace')
      await queryClient.invalidateQueries()
    } catch (error) {
      setRestoreError(
        error instanceof Error ? error.message : 'That file could not be read.',
      )
    }
  }

  if (!team) return null

  return (
    <Screen>
      <TopBar title="Season" back={{ to: '/' }} />

      <main className="flex flex-1 flex-col gap-4 px-5 pt-1">
        {finished.length === 0 ? (
          <EmptyState
            title="No finished games yet"
            body="Once you have played a game, this is where the season adds up: minutes per child, goals, and whether the time is landing evenly."
            action={
              <LinkButton
                to="/teams/$teamId/new-game"
                params={{ teamId }}
                tone="action"
                className="mt-2 px-6"
              >
                Start a game
              </LinkButton>
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2.5">
              <Stat value={String(totals.games)} label="games" />
              <Stat value={formatClock(totals.averageMsPerPlayer)} label="avg per child" />
              <Stat
                value={`±${formatClock(totals.typicalSpreadMs / 2)}`}
                label="typical spread"
                tone={totals.typicalSpreadMs <= 3 * 60_000 ? 'good' : 'warn'}
              />
            </div>

            <div className="flex gap-1 rounded-2xl bg-chip p-1">
              {(['games', 'players'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={tab === value}
                  onClick={() => setTab(value)}
                  className={`press h-11 flex-1 rounded-xl text-[15px] font-semibold capitalize ${
                    tab === value ? 'bg-card text-ink shadow-sm' : 'text-muted'
                  }`}
                >
                  {value}
                </button>
              ))}
            </div>

            {tab === 'games' ? (
              <List>
                {[...finished]
                  .sort((a, b) => b.game.date - a.game.date)
                  .map((entry) => {
                    const summary = summarizeGame(entry)
                    const tone =
                      summary.result === 'win'
                        ? 'text-pitch'
                        : summary.result === 'loss'
                          ? 'text-loss'
                          : 'text-muted'
                    return (
                      <Link
                        key={entry.game.id}
                        to="/games/$gameId/summary"
                        params={{ gameId: entry.game.id }}
                        className="flex h-[66px] items-center gap-3 px-4 no-underline"
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[16px] font-semibold text-ink">
                            vs {entry.game.opponent}
                          </span>
                          <span className="text-[13px] text-faint">
                            {formatDate(entry.game.date)} · spread{' '}
                            {formatClock(summary.spreadMs)}
                          </span>
                        </span>
                        <span className={`cond tnum text-[24px] font-extrabold ${tone}`}>
                          {summary.ourScore}–{summary.theirScore}
                        </span>
                        <span className="text-edge">
                          <ChevronRightIcon />
                        </span>
                      </Link>
                    )
                  })}
              </List>
            ) : (
              <>
                <DataTable
                  data={rows}
                  columns={columns}
                  getRowId={(row) => row.playerId}
                  initialSort={{ id: 'average', desc: true }}
                  align={{ games: 'right', average: 'right', vsTeam: 'right' }}
                />
                <p className="px-1 text-[13px] text-faint">
                  A child's average is measured only over the games they were available
                  for, so missing a Saturday never counts against them.
                </p>
              </>
            )}
          </>
        )}

        <div className="flex-1" />

        <div className="flex flex-col gap-2">
          <SectionLabel>Backup</SectionLabel>
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-[14px] text-muted">
              Restoring a backup of this team replaces what is on this phone with what is
              in the file.
            </p>
            {restoreError ? (
              <p className="text-[14px] font-medium text-loss">{restoreError}</p>
            ) : null}
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleRestore(file)
                event.target.value = ''
              }}
            />
            <Button tone="quiet" onClick={() => fileInput.current?.click()}>
              Restore from a backup file
            </Button>
          </Card>
        </div>
      </main>
    </Screen>
  )
}

function Stat({
  value,
  label,
  tone = 'plain',
}: {
  value: string
  label: string
  tone?: 'plain' | 'good' | 'warn'
}) {
  const color = tone === 'good' ? 'text-pitch' : tone === 'warn' ? 'text-amber' : 'text-ink'
  return (
    <Card className="flex flex-col gap-0.5 p-3.5">
      <span className={`cond tnum text-[26px] leading-none font-extrabold ${color}`}>
        {value}
      </span>
      <span className="text-[12px] text-muted">{label}</span>
    </Card>
  )
}
