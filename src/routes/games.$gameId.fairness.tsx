import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { eventsQuery, gameQuery, playersQuery, useAppendEvent } from '~/db/queries'
import { deriveClock } from '~/engine/clock'
import { derivePlaytime } from '~/engine/playtime'
import {
  adjustedMs,
  averageMs,
  band,
  projectedCatchUpMs,
  spreadMs,
  suggestSwap,
} from '~/engine/fairness'
import { useNow } from '~/lib/now'
import { formatClock } from '~/lib/time'
import { Button, Card, Screen, SectionLabel, SwapIcon, TopBar } from '~/components/ui'

export const Route = createFileRoute('/games/$gameId/fairness')({
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
  component: Fairness,
})

function Fairness() {
  const { gameId } = Route.useParams()
  const now = useNow()
  const { data: game } = useQuery(gameQuery(gameId))
  const { data: events = [] } = useQuery(eventsQuery(gameId))
  const { data: players = [] } = useQuery({
    ...playersQuery(game?.teamId ?? ''),
    enabled: Boolean(game),
  })
  const appendEvent = useAppendEvent(gameId)

  if (!game) return null

  const times = derivePlaytime(events, game.presentPlayerIds, now)
  const clock = deriveClock(events, game.settings, now)
  const nameById = new Map(players.map((player) => [player.id, player.name]))
  const average = averageMs(times)
  const ordered = [...times].sort((a, b) => adjustedMs(b) - adjustedMs(a))
  // Scale to the busiest child rather than to the whole game, so the
  // differences between children stay legible from the first minute.
  const maxScale = Math.max(1, ...times.map(adjustedMs))
  const swap = suggestSwap(times)
  const timeFor = (playerId: string) => {
    const time = times.find((entry) => entry.playerId === playerId)
    return time ? adjustedMs(time) : 0
  }

  const periodsLeft = Math.max(0, game.settings.periods - clock.period)
  const remainingMs = clock.remainingMs + periodsLeft * game.settings.periodMs
  const catchUp = projectedCatchUpMs(times, game.settings.fieldSize, remainingMs)

  // The bar track starts after the name and time columns: 68 + 10 + 44 + 10.
  const TRACK_LEFT = '132px'
  const averageFraction = Math.min(1, average / maxScale)

  return (
    <Screen>
      <TopBar title="Fair time" back={{ to: '/games/$gameId', params: { gameId } }} backLabel="Game" />

      <main className="flex flex-1 flex-col gap-5 px-5 pt-1">
        <Card className="flex flex-col gap-3.5 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
              Minutes this game
            </h2>
            <span className="tnum text-[13px] text-faint">
              average {formatClock(average)}
            </span>
          </div>

          <div className="relative flex flex-col gap-2.5">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-0 bottom-0 z-10 border-l-2 border-dashed border-ink/40"
              style={{
                left: `calc(${TRACK_LEFT} + (100% - ${TRACK_LEFT}) * ${averageFraction})`,
              }}
            />
            {ordered.map((time) => {
              const tone = band(adjustedMs(time), average)
              const color =
                tone === 'behind' ? 'bg-amber' : tone === 'ahead' ? 'bg-action' : 'bg-pitch'
              const textColor =
                tone === 'behind' ? 'text-amber' : tone === 'ahead' ? 'text-action' : 'text-pitch'
              return (
                <div key={time.playerId} className="flex items-center gap-2.5">
                  <span className="flex w-[68px] shrink-0 items-baseline gap-1 truncate text-[15px] font-semibold">
                    <span className="truncate">{nameById.get(time.playerId) ?? 'Player'}</span>
                    {time.creditMs > 0 ? (
                      <span
                        title="Arrived late, credited the team average so far"
                        className="text-[10px] font-bold tracking-wide text-faint uppercase"
                      >
                        late
                      </span>
                    ) : null}
                  </span>
                  <span className={`cond tnum w-11 shrink-0 text-right text-[17px] font-bold ${textColor}`}>
                    {formatClock(adjustedMs(time))}
                  </span>
                  <span className="relative h-3.5 flex-1 overflow-hidden rounded-full bg-divider">
                    <span
                      className={`absolute inset-y-0 left-0 rounded-full ${color}`}
                      style={{
                        width: `${Math.max(2, Math.round((100 * adjustedMs(time)) / maxScale))}%`,
                      }}
                    />
                  </span>
                </div>
              )
            })}
          </div>

          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
            <Key color="bg-amber" label="needs time" />
            <Key color="bg-pitch" label="about even" />
            <Key color="bg-action" label="ahead" />
            <span className="flex items-center gap-1.5">
              <span className="h-0 w-3 border-t-2 border-dashed border-ink/40" />
              average
            </span>
          </div>
        </Card>

        <div className="flex flex-col gap-2">
          <SectionLabel trailing={`spread ${formatClock(spreadMs(times))}`}>
            Suggested next sub
          </SectionLabel>

          {swap ? (
            <div className="flex flex-col gap-3.5 rounded-2xl bg-ink p-4 text-white">
              <div className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[12px] tracking-[0.06em] text-slate uppercase">
                    Bring on
                  </span>
                  <span className="cond truncate text-[26px] leading-none font-bold">
                    {nameById.get(swap.onPlayerId) ?? 'Player'}
                  </span>
                  <span className="tnum text-[13px] text-slate">
                    {formatClock(timeFor(swap.onPlayerId))} played
                  </span>
                </span>
                <span className="shrink-0 text-slate">
                  <SwapIcon size={26} />
                </span>
                <span className="flex min-w-0 flex-col items-end gap-0.5">
                  <span className="text-[12px] tracking-[0.06em] text-slate uppercase">
                    Take off
                  </span>
                  <span className="cond truncate text-[26px] leading-none font-bold">
                    {nameById.get(swap.offPlayerId) ?? 'Player'}
                  </span>
                  <span className="tnum text-[13px] text-slate">
                    {formatClock(timeFor(swap.offPlayerId))} played
                  </span>
                </span>
              </div>
              <Button
                tone="primary"
                onClick={() =>
                  appendEvent.mutate({
                    type: 'sub',
                    onPlayerId: swap.onPlayerId,
                    offPlayerId: swap.offPlayerId,
                  })
                }
              >
                Make this sub
              </Button>
            </div>
          ) : (
            <Card className="p-4 text-[15px] leading-relaxed text-muted">
              Everyone is level. Any swap you like is a fair one.
            </Card>
          )}
        </div>

        <p className="px-1 text-[14px] leading-relaxed text-muted">
          {catchUp !== null
            ? `Keep swapping at this rate and everyone lands within about ${formatClock(
                catchUp,
              )} of each other by the final whistle.`
            : clock.isComplete
              ? 'This game is finished. These are the final minutes.'
              : 'There is enough time left to even this out completely.'}
        </p>
      </main>
    </Screen>
  )
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`size-2.5 rounded-full ${color}`} />
      {label}
    </span>
  )
}
