import { useMemo, useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { eventsQuery, gameQuery, playersQuery, useDeleteGame } from '~/db/queries'
import { summarizeGame } from '~/engine/reports'
import { band } from '~/engine/fairness'
import { gameCsv, offerFile } from '~/lib/transfer'
import { formatClock, formatDate, formatDelta } from '~/lib/time'
import { DataTable, type Columns } from '~/components/DataTable'
import {
  Button,
  Card,
  LinkButton,
  Screen,
  SectionLabel,
  ShareIcon,
  TopBar,
} from '~/components/ui'

export const Route = createFileRoute('/games/$gameId/summary')({
  loader: async ({ context, params }) => {
    const game = await context.queryClient.ensureQueryData(gameQuery(params.gameId))
    if (game) {
      await Promise.all([
        context.queryClient.ensureQueryData(eventsQuery(params.gameId)),
        context.queryClient.ensureQueryData(playersQuery(game.teamId)),
      ])
    }
    return game
  },
  component: Summary,
})

/**
 * A row in the minutes table.
 *
 * Declared as a type alias rather than an interface on purpose: TanStack Table
 * constrains its row data to an indexable object, and only aliases pick up an
 * implicit index signature.
 */
type MinutesRow = {
  playerId: string
  name: string
  totalMs: number
  deltaMs: number
}

function Summary() {
  const { gameId } = Route.useParams()
  const navigate = useNavigate()
  const { data: game } = useQuery(gameQuery(gameId))
  const { data: events = [] } = useQuery(eventsQuery(gameId))
  const { data: players = [] } = useQuery({
    ...playersQuery(game?.teamId ?? ''),
    enabled: Boolean(game),
  })
  const [busy, setBusy] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const deleteGame = useDeleteGame(game?.teamId ?? '')

  const summary = useMemo(
    () => (game ? summarizeGame({ game, events }) : null),
    [game, events],
  )

  const rows = useMemo<MinutesRow[]>(() => {
    if (!summary) return []
    const nameById = new Map(players.map((player) => [player.id, player.name]))
    return summary.times.map((time) => ({
      playerId: time.playerId,
      name: nameById.get(time.playerId) ?? 'Player',
      totalMs: time.totalMs,
      deltaMs: Math.round(time.totalMs - summary.averageMs),
    }))
  }, [summary, players])

  const columns = useMemo<Columns<MinutesRow>>(() => {
    const average = summary?.averageMs ?? 0
    return [
      {
        id: 'name',
        accessorFn: (row) => row.name,
        header: 'Player',
        sortFn: 'basic',
        cell: (info) => (
          <span className="text-[16px] font-semibold">{String(info.getValue())}</span>
        ),
      },
      {
        id: 'time',
        accessorFn: (row) => row.totalMs,
        header: 'Time',
        sortFn: 'basic',
        cell: (info) => (
          <span className="cond tnum text-[18px] font-bold">
            {formatClock(Number(info.getValue()))}
          </span>
        ),
      },
      {
        id: 'delta',
        accessorFn: (row) => row.deltaMs,
        header: 'vs avg',
        sortFn: 'basic',
        cell: (info) => {
          const row = info.row.original
          const tone = band(row.totalMs, average)
          const color =
            tone === 'behind' ? 'text-amber' : tone === 'ahead' ? 'text-action' : 'text-pitch'
          return (
            <span className={`tnum text-[14px] font-semibold ${color}`}>
              {formatDelta(row.deltaMs)}
            </span>
          )
        },
      },
    ]
  }, [summary])

  if (!game || !summary) return null

  const handleCsv = async () => {
    setBusy(true)
    try {
      const csv = await gameCsv(gameId)
      const slug = game.opponent.toLowerCase().replace(/[^a-z0-9]+/g, '-')
      await offerFile(`sideline-${slug || 'game'}.csv`, csv, 'text/csv')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen>
      <TopBar
        title={game.status === 'final' ? 'Full time' : 'Game so far'}
        back={{ to: '/' }}
        backLabel="Done"
      />

      <main className="flex flex-1 flex-col gap-4 px-5 pt-1">
        <div className="flex flex-col items-center gap-1.5 rounded-3xl bg-pitch px-5 py-5 text-white">
          <p className="text-[14px] text-pitch-pale">
            vs {game.opponent} · {formatDate(game.date)}
          </p>
          <p className="cond tnum flex items-baseline gap-3.5">
            <span className="text-[58px] leading-none font-extrabold">{summary.ourScore}</span>
            <span className="text-[30px] font-semibold text-pitch-pale">–</span>
            <span className="text-[58px] leading-none font-extrabold text-salmon">
              {summary.theirScore}
            </span>
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel
            trailing={`spread ${formatClock(summary.spreadMs)} · avg ${formatClock(summary.averageMs)}`}
          >
            Minutes played
          </SectionLabel>
          <DataTable
            data={rows}
            columns={columns}
            getRowId={(row) => row.playerId}
            initialSort={{ id: 'time', desc: true }}
            align={{ time: 'right', delta: 'right' }}
          />
          <p className="px-1 text-[13px] text-faint">
            Tap a column heading to sort. A spread under a couple of minutes is a fair game.
          </p>
        </div>

        {game.status !== 'final' ? (
          <LinkButton to="/games/$gameId" params={{ gameId }} tone="action" size="lg">
            Back to the game
          </LinkButton>
        ) : null}

        <div className="flex-1" />

        <div className="flex flex-col gap-2.5 pb-1">
          <Button tone="quiet" onClick={handleCsv} disabled={busy}>
            <ShareIcon size={18} />
            {busy ? 'Preparing…' : 'Share the minutes'}
          </Button>

          {confirmingDelete ? (
            <Card className="flex flex-col gap-3 border-loss p-4">
              <p className="text-[14px] text-muted">
                Delete this game? It disappears from the season and from everyone's
                averages. This cannot be undone.
              </p>
              <div className="flex gap-2.5">
                <Button
                  tone="quiet"
                  className="flex-1"
                  onClick={() => setConfirmingDelete(false)}
                >
                  Keep it
                </Button>
                <Button
                  tone="action"
                  className="flex-1 !bg-loss"
                  onClick={async () => {
                    await deleteGame.mutateAsync(gameId)
                    await navigate({ to: '/' })
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ) : (
            <Button tone="danger" onClick={() => setConfirmingDelete(true)}>
              Delete this game
            </Button>
          )}

          <p className="text-center text-[12px] text-faint">
            {game.settings.periods} × {Math.round(game.settings.periodMs / 60_000)} minutes
            · {game.settings.fieldSize} on the field
          </p>
        </div>
      </main>
    </Screen>
  )
}
