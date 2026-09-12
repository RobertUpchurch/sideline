import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import {
  eventsQuery,
  gameQuery,
  playersQuery,
  useAppendEvent,
  useDeleteGame,
  useUndoLastEvent,
  useUpdateGame,
} from '~/db/queries'
import { MAX_STOPPAGE_CHIPS } from '~/db/schema'
import { breakLabel, deriveClock, nextPeriod, periodLabel } from '~/engine/clock'
import { derivePlaytime, deriveScore } from '~/engine/playtime'
import {
  averageMs,
  band,
  benchOrder,
  lineupForNextPeriod,
  suggestLineup,
} from '~/engine/fairness'
import { alertBreakEnd, alertPeriodEnd, primeAudio } from '~/lib/alerts'
import { useNow } from '~/lib/now'
import { useWakeLock } from '~/lib/wakeLock'
import { formatClock, formatDelta } from '~/lib/time'
import {
  Button,
  CheckIcon,
  CloseIcon,
  MoreIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  Screen,
  SwapIcon,
  TimeBar,
  UndoIcon,
} from '~/components/ui'
import type { Id, PlayerTime } from '~/engine/types'

export const Route = createFileRoute('/games/$gameId/')({
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
  component: LiveGame,
})

function LiveGame() {
  const { gameId } = Route.useParams()
  const navigate = useNavigate()
  const now = useNow()

  const { data: game } = useQuery(gameQuery(gameId))
  const { data: events = [] } = useQuery(eventsQuery(gameId))
  const teamId = game?.teamId ?? ''
  const { data: players = [] } = useQuery({
    ...playersQuery(teamId),
    enabled: Boolean(teamId),
  })

  const appendEvent = useAppendEvent(gameId)
  const undoEvent = useUndoLastEvent(gameId)
  const updateGame = useUpdateGame(gameId)
  const deleteGame = useDeleteGame(teamId)

  const [selected, setSelected] = useState<Id | null>(null)
  const [breakLineup, setBreakLineup] = useState<Id[] | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  const settings = game?.settings
  const clock = useMemo(
    () => (settings ? deriveClock(events, settings, now) : null),
    [events, settings, now],
  )
  const times = useMemo(
    () => (game ? derivePlaytime(events, game.presentPlayerIds, now) : []),
    [events, game, now],
  )

  useWakeLock(clock?.phase === 'running' || clock?.phase === 'paused')

  // One alert per boundary, whether or not the coach is looking at the screen.
  const alerted = useRef<string | null>(null)
  useEffect(() => {
    if (!clock) return
    if (clock.phase === 'running' && clock.remainingMs === 0) {
      const key = `period-${clock.period}`
      if (alerted.current !== key) {
        alerted.current = key
        alertPeriodEnd()
      }
    } else if (clock.phase === 'break' && clock.breakRemainingMs === 0) {
      const key = `break-${clock.period}`
      if (alerted.current !== key) {
        alerted.current = key
        alertBreakEnd()
      }
    }
  }, [clock])

  const nameById = useMemo(
    () => new Map(players.map((player) => [player.id, player.name])),
    [players],
  )

  if (!game || !settings || !clock) return null

  const [us, them] = deriveScore(events)
  const average = averageMs(times)
  const maxTotal = Math.max(1, ...times.map((time) => time.totalMs))
  const field = times.filter((time) => time.onField)
  const bench = benchOrder(times)
  const upNext = nextPeriod(clock, settings)
  const selectedIsField = selected !== null && field.some((t) => t.playerId === selected)
  const selectedIsBench = selected !== null && bench.some((t) => t.playerId === selected)

  const swap = async (onPlayerId: Id, offPlayerId: Id) => {
    setSelected(null)
    await appendEvent.mutateAsync({ type: 'sub', onPlayerId, offPlayerId })
  }

  const startPeriod = async (period: number) => {
    primeAudio()
    if (period > 1) {
      // Write the lineup the coach can see, whether they changed it or simply
      // accepted the suggestion. Without this the previous period's eleven
      // would silently carry over and the screen would have lied.
      const lineup = lineupForNextPeriod(breakLineup, times, settings.fieldSize)
      await appendEvent.mutateAsync({ type: 'lineup_set', playerIds: lineup })
    }
    setBreakLineup(null)
    await appendEvent.mutateAsync({ type: 'period_start', period })
  }

  const finalize = async () => {
    await updateGame.mutateAsync({ status: 'final', finalizedAt: Date.now() })
    await navigate({ to: '/games/$gameId/summary', params: { gameId } })
  }

  const endPeriod = async () => {
    await appendEvent.mutateAsync({ type: 'period_end', period: clock.period })
    if (clock.period >= settings.periods) {
      await appendEvent.mutateAsync({ type: 'game_end' })
      await finalize()
    }
  }

  /**
   * Blows the final whistle whatever the clock says.
   *
   * Kindergarten games end when they end — the light goes, the referee has
   * had enough, or half the team wants their snack. Whatever has been played
   * is what gets saved.
   */
  const endGameNow = async () => {
    if (clock.phase === 'running' || clock.phase === 'paused') {
      await appendEvent.mutateAsync({ type: 'period_end', period: clock.period })
    }
    await appendEvent.mutateAsync({ type: 'game_end' })
    await finalize()
  }

  const discardGame = async () => {
    await deleteGame.mutateAsync(gameId)
    await navigate({ to: '/' })
  }

  const label =
    clock.phase === 'break'
      ? breakLabel(clock.period, settings.periods)
      : periodLabel(clock.period, settings.periods)

  const showBreak = clock.phase === 'break' && upNext !== null

  return (
    <Screen>
      <header className="flex h-11 items-center justify-between gap-2 px-2 pl-5">
        <div className="flex min-w-0 items-baseline gap-2">
          <span className="cond text-[20px] font-bold">{label}</span>
          <span className="truncate text-[14px] text-muted">vs {game.opponent}</span>
        </div>
        <div className="flex shrink-0 items-center">
          {events.length > 1 ? (
            <button
              type="button"
              aria-label="Undo the last thing I did"
              onClick={() => {
                setSelected(null)
                undoEvent.mutate()
              }}
              className="press flex size-11 items-center justify-center rounded-xl text-muted"
            >
              <UndoIcon />
            </button>
          ) : null}
          <Link
            to="/games/$gameId/fairness"
            params={{ gameId }}
            className="flex h-11 items-center px-3 font-semibold text-pitch"
          >
            Fair time
          </Link>
        </div>
      </header>

      <section className="mx-5 flex flex-col gap-2.5 rounded-3xl bg-ink p-4 text-white">
        <div className="flex items-end justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span
              className={`cond tnum text-[60px] leading-[0.9] font-extrabold tracking-tight ${
                clock.phase === 'break'
                  ? 'text-pitch-pale'
                  : clock.remainingMs <= 60_000 && clock.phase !== 'pregame'
                    ? 'text-salmon'
                    : 'text-white'
              }`}
            >
              {formatClock(clock.phase === 'break' ? clock.breakRemainingMs : clock.remainingMs)}
            </span>
            <span className="tnum truncate text-[13px] text-slate">
              {clockCaption(clock, settings.periods)}
            </span>
          </div>
          <div className="cond tnum flex shrink-0 items-baseline gap-1.5 pb-1">
            <span className="text-[40px] leading-none font-extrabold">{us}</span>
            <span className="text-[24px] font-semibold text-slate">–</span>
            <span className="text-[40px] leading-none font-extrabold text-salmon">{them}</span>
          </div>
        </div>

        {/*
          Three layers, in the order a coach reaches for them. Scoring is the
          thing that happens without warning, so it sits closest to the score
          it changes. The clock control is deliberate. Stoppage is rarest, and
          furthest away.

          Nobody can score before the referee starts the game, so until then
          the only thing here is kick off.
        */}
        {clock.phase !== 'pregame' ? (
          <div className="flex gap-2">
            <button
              type="button"
              aria-label="Add a goal for us"
              onClick={() => appendEvent.mutate({ type: 'goal_us' })}
              className="press flex h-14 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/12 text-white"
            >
              <PlusIcon size={18} />
              <span className="text-[17px] font-bold">Us</span>
            </button>
            <button
              type="button"
              aria-label="Add a goal for the other team"
              onClick={() => appendEvent.mutate({ type: 'goal_them' })}
              className="press flex h-14 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-white/12 text-salmon"
            >
              <PlusIcon size={18} />
              <span className="text-[17px] font-bold">Them</span>
            </button>
          </div>
        ) : null}

        {clock.phase === 'pregame' || showBreak ? (
          <button
            type="button"
            onClick={() => void startPeriod(upNext ?? 1)}
            className="press flex h-14 items-center justify-center gap-2 rounded-2xl bg-action text-[19px] font-bold"
          >
            <PlayIcon size={20} />
            {clock.phase === 'pregame'
              ? 'Kick off'
              : `Start ${periodLabel(upNext ?? 2, settings.periods)}`}
          </button>
        ) : (
          <button
            type="button"
            onClick={() =>
              appendEvent.mutate({ type: clock.isRunning ? 'pause' : 'resume' })
            }
            className={`press flex h-14 items-center justify-center gap-2 rounded-2xl text-[19px] font-bold ${
              clock.isRunning ? 'bg-white/12' : 'bg-pitch'
            }`}
          >
            {clock.isRunning ? <PauseIcon /> : <PlayIcon />}
            {clock.isRunning ? 'Pause' : 'Resume'}
          </button>
        )}

        {clock.phase === 'running' || clock.phase === 'paused' ? (
          <div className="flex gap-2">
            {settings.stoppageIncrementsMs.slice(0, MAX_STOPPAGE_CHIPS).map((ms) => (
              <button
                key={ms}
                type="button"
                aria-label={`Add ${formatClock(ms)} of stoppage time`}
                onClick={() =>
                  appendEvent.mutate({ type: 'stoppage_added', period: clock.period, ms })
                }
                className="press cond tnum flex h-12 flex-1 items-center justify-center rounded-xl bg-white/12 text-[19px] font-bold"
              >
                +{stoppageLabel(ms)}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {showBreak ? (
        <BreakLineup
          times={times}
          nameById={nameById}
          fieldSize={settings.fieldSize}
          chosen={breakLineup ?? suggestLineup(times, settings.fieldSize)}
          onChange={setBreakLineup}
        />
      ) : (
        <>
          <section className="mt-3.5 flex flex-col gap-2 px-5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
                On the field
              </h2>
              <span className="text-[13px] text-faint">
                {selectedIsField
                  ? 'now tap who comes on'
                  : selectedIsBench
                    ? 'now tap who comes off'
                    : clock.phase === 'pregame'
                      ? 'tap a player to change the lineup'
                      : 'tap a player, then who swaps with them'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              {field.map((time) => (
                <FieldCard
                  key={time.playerId}
                  time={time}
                  name={nameById.get(time.playerId) ?? 'Player'}
                  selected={selected === time.playerId}
                  average={average}
                  maxTotal={maxTotal}
                  onTap={() => {
                    if (selectedIsBench && selected) void swap(selected, time.playerId)
                    else setSelected(selected === time.playerId ? null : time.playerId)
                  }}
                />
              ))}
            </div>

          </section>

          <section className="mt-3.5 flex flex-col gap-2 px-5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
                Bench · least time first
              </h2>
              <span className="tnum text-[13px] text-faint">
                team avg {formatClock(average)}
              </span>
            </div>

            {bench.length === 0 ? (
              <p className="rounded-2xl border border-edge bg-card p-4 text-[14px] text-muted">
                Everyone who turned up is on the field.
              </p>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-edge bg-card">
                <div className="flex flex-col divide-y divide-divider">
                  {bench.map((time, index) => (
                    <BenchRow
                      key={time.playerId}
                      time={time}
                      name={nameById.get(time.playerId) ?? 'Player'}
                      average={average}
                      selected={selected === time.playerId}
                      highlighted={selectedIsField && index === 0}
                      armed={selectedIsField}
                      onTap={() => {
                        if (selectedIsField && selected) void swap(time.playerId, selected)
                        else setSelected(selected === time.playerId ? null : time.playerId)
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </>
      )}

      <div className="flex-1" />

      <div className="flex items-center justify-center gap-1 px-5 pt-4">
        {clock.phase === 'running' || clock.phase === 'paused' ? (
          <button
            type="button"
            onClick={() => void endPeriod()}
            className="press flex h-11 items-center rounded-xl px-4 font-semibold text-muted"
          >
            End {periodLabel(clock.period, settings.periods).toLowerCase()}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="More options for this game"
          onClick={() => setMenuOpen(true)}
          className="press flex size-11 items-center justify-center rounded-xl text-muted"
        >
          <MoreIcon />
        </button>
      </div>

      {menuOpen ? (
        <GameMenu
          canEnd={clock.phase !== 'pregame'}
          onClose={() => setMenuOpen(false)}
          onEndGame={endGameNow}
          onDiscard={discardGame}
        />
      ) : null}
    </Screen>
  )
}

/**
 * The way out of a game that should not have been started, or that stopped
 * before the clock said so.
 */
function GameMenu({
  canEnd,
  onClose,
  onEndGame,
  onDiscard,
}: {
  canEnd: boolean
  onClose: () => void
  onEndGame: () => Promise<void>
  onDiscard: () => Promise<void>
}) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-ink/40" onClick={onClose}>
      <div
        className="flex flex-col gap-3 rounded-t-3xl bg-ground px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="cond text-[22px] font-bold">This game</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex size-11 items-center justify-center rounded-xl bg-chip text-muted"
          >
            <CloseIcon />
          </button>
        </div>

        {confirmingDiscard ? (
          <>
            <p className="text-[15px] leading-relaxed text-muted">
              Throw this game away? The minutes everyone has played today go with it. This
              cannot be undone.
            </p>
            <div className="flex gap-2.5">
              <Button
                tone="quiet"
                className="flex-1"
                onClick={() => setConfirmingDiscard(false)}
              >
                Keep it
              </Button>
              <Button tone="action" className="flex-1 !bg-loss" onClick={() => void onDiscard()}>
                Discard
              </Button>
            </div>
          </>
        ) : (
          <>
            {canEnd ? (
              <>
                <Button tone="primary" onClick={() => void onEndGame()}>
                  End the game now
                </Button>
                <p className="px-1 text-[13px] text-faint">
                  Saves the game with whatever has been played so far, however much time
                  is left on the clock.
                </p>
              </>
            ) : null}
            <Button tone="danger" onClick={() => setConfirmingDiscard(true)}>
              Discard this game
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function clockCaption(
  clock: ReturnType<typeof deriveClock>,
  periods: number,
): string {
  if (clock.phase === 'pregame') return 'ready when the referee is'
  if (clock.phase === 'break') {
    return `break left · ${periodLabel(clock.period + 1, periods)} is next`
  }
  if (clock.phase === 'final') return 'full time'
  const played = `${formatClock(clock.elapsedMs)} played`
  if (clock.stoppageMs > 0) {
    return `left · +${formatClock(clock.stoppageMs)} stoppage · ${played}`
  }
  if (clock.phase === 'paused') return `clock stopped · ${played}`
  return `left in the ${periodLabel(clock.period, periods).toLowerCase()} · ${played}`
}

function stoppageLabel(ms: number): string {
  return ms < 60_000 ? `${Math.round(ms / 1000)}s` : formatClock(ms)
}

function FieldCard({
  time,
  name,
  selected,
  average,
  maxTotal,
  onTap,
}: {
  time: PlayerTime
  name: string
  selected: boolean
  average: number
  maxTotal: number
  onTap: () => void
}) {
  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={selected}
      className={`press flex h-[72px] flex-col justify-between rounded-2xl border-2 px-3 py-2.5 text-left ${
        selected ? 'border-pitch bg-pitch' : 'border-edge bg-card'
      }`}
    >
      <span className="flex items-center justify-between gap-2">
        <span
          className={`min-w-0 truncate text-[16px] font-bold ${
            selected ? 'text-white' : 'text-ink'
          }`}
        >
          {name}
        </span>
        <span
          className={`cond tnum shrink-0 text-[19px] font-bold ${
            selected ? 'text-white' : 'text-ink'
          }`}
        >
          {formatClock(time.totalMs)}
        </span>
      </span>
      <span className="flex items-center justify-between gap-2">
        <span className={`tnum text-[12px] ${selected ? 'text-pitch-pale' : 'text-faint'}`}>
          on {formatClock(time.currentStintMs)}
        </span>
        {selected ? (
          <span className="h-1.5 w-[84px] overflow-hidden rounded-full bg-white/25">
            <span
              className="block h-1.5 rounded-full bg-white"
              style={{ width: `${Math.max(2, Math.round((100 * time.totalMs) / maxTotal))}%` }}
            />
          </span>
        ) : (
          <TimeBar
            value={time.totalMs}
            max={maxTotal}
            tone={band(time.totalMs, average)}
            className="w-[84px]"
          />
        )}
      </span>
    </button>
  )
}

function BenchRow({
  time,
  name,
  average,
  selected,
  highlighted,
  armed,
  onTap,
}: {
  time: PlayerTime
  name: string
  average: number
  selected: boolean
  highlighted: boolean
  armed: boolean
  onTap: () => void
}) {
  const delta = Math.round(time.totalMs - average)
  const tone = band(time.totalMs, average)
  const deltaColor =
    tone === 'behind' ? 'text-amber' : tone === 'ahead' ? 'text-action' : 'text-pitch'

  return (
    <button
      type="button"
      onClick={onTap}
      aria-pressed={selected}
      className={`press flex h-[52px] items-center gap-3 pr-3 pl-4 text-left ${
        selected ? 'bg-pitch-mint' : highlighted ? 'bg-pitch-mint/50' : 'bg-card'
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[16px] font-semibold">{name}</span>
        <span className="tnum text-[12px] text-faint">
          sitting {formatClock(time.benchMs)}
        </span>
      </span>
      <span className="flex shrink-0 flex-col items-end">
        <span className="cond tnum text-[19px] leading-tight font-bold">
          {formatClock(time.totalMs)}
        </span>
        <span className={`tnum text-[12px] font-semibold ${deltaColor}`}>
          {formatDelta(delta)} vs avg
        </span>
      </span>
      <span
        className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
          armed || selected ? 'bg-pitch text-white' : 'bg-chip text-muted'
        }`}
      >
        <SwapIcon />
      </span>
    </button>
  )
}

function BreakLineup({
  times,
  nameById,
  fieldSize,
  chosen,
  onChange,
}: {
  times: PlayerTime[]
  nameById: Map<Id, string>
  fieldSize: number
  chosen: Id[]
  onChange: (next: Id[]) => void
}) {
  const chosenSet = new Set(chosen)
  const ordered = [...times].sort((a, b) => a.totalMs - b.totalMs || b.benchMs - a.benchMs)

  const toggle = (playerId: Id) => {
    if (chosenSet.has(playerId)) onChange(chosen.filter((id) => id !== playerId))
    else if (chosen.length < fieldSize) onChange([...chosen, playerId])
  }

  return (
    <section className="mt-3.5 flex flex-col gap-2 px-5">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
          Who starts the next period
        </h2>
        <span className={chosen.length === fieldSize ? 'text-[13px] text-pitch' : 'text-[13px] text-amber'}>
          {chosen.length} of {fieldSize}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {ordered.map((time) => {
          const picked = chosenSet.has(time.playerId)
          return (
            <button
              key={time.playerId}
              type="button"
              aria-pressed={picked}
              onClick={() => toggle(time.playerId)}
              className={`press flex h-[68px] items-center gap-2 rounded-2xl border-2 px-3 text-left ${
                picked ? 'border-pitch bg-pitch' : 'border-edge bg-card'
              }`}
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span
                  className={`truncate text-[16px] font-semibold ${
                    picked ? 'text-white' : 'text-ink'
                  }`}
                >
                  {nameById.get(time.playerId) ?? 'Player'}
                </span>
                <span
                  className={`tnum text-[12px] ${picked ? 'text-pitch-pale' : 'text-faint'}`}
                >
                  {formatClock(time.totalMs)} played
                </span>
              </span>
              {picked ? (
                <span className="shrink-0 text-white">
                  <CheckIcon size={20} />
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      <p className="px-1 text-[13px] text-faint">
        Already set to whoever has played least. Tap to change it.
      </p>
    </section>
  )
}
