import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { playersQuery, teamQuery, useCreateGame } from '~/db/queries'
import { primeAudio } from '~/lib/alerts'
import { fromDateInputValue, toDateInputValue } from '~/lib/time'
import {
  Button,
  Card,
  CheckIcon,
  EmptyState,
  Field,
  LinkButton,
  PlayIcon,
  Screen,
  SectionLabel,
  TopBar,
  inputClass,
} from '~/components/ui'

export const Route = createFileRoute('/teams/$teamId/new-game')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(teamQuery(params.teamId)),
      context.queryClient.ensureQueryData(playersQuery(params.teamId)),
    ]),
  component: NewGame,
})

function NewGame() {
  const { teamId } = Route.useParams()
  const navigate = useNavigate()
  const { data: team } = useQuery(teamQuery(teamId))
  const { data: allPlayers = [] } = useQuery(playersQuery(teamId))
  const createGame = useCreateGame(teamId)

  const roster = allPlayers.filter((player) => player.active)
  const [opponent, setOpponent] = useState('')
  const [date, setDate] = useState(() => toDateInputValue(Date.now()))
  const [absent, setAbsent] = useState<Set<string>>(new Set())
  const [lineup, setLineup] = useState<string[]>([])

  if (!team) return null

  const fieldSize = team.settings.fieldSize
  const present = roster.filter((player) => !absent.has(player.id))
  const lineupSet = new Set(lineup)
  const ready = present.length >= fieldSize && lineup.length === fieldSize

  if (roster.length === 0) {
    return (
      <Screen>
        <TopBar title="New game" back={{ to: '/' }} />
        <EmptyState
          title="Add your players first"
          body="Sideline needs to know who is on the team before it can track anyone's minutes."
          action={
            <LinkButton
              to="/teams/$teamId/roster"
              params={{ teamId }}
              tone="primary"
              className="mt-2 px-6"
            >
              Go to the roster
            </LinkButton>
          }
        />
      </Screen>
    )
  }

  const toggleAbsent = (playerId: string) => {
    const next = new Set(absent)
    if (next.has(playerId)) next.delete(playerId)
    else {
      next.add(playerId)
      setLineup((current) => current.filter((id) => id !== playerId))
    }
    setAbsent(next)
  }

  const toggleLineup = (playerId: string) => {
    setLineup((current) => {
      if (current.includes(playerId)) return current.filter((id) => id !== playerId)
      if (current.length >= fieldSize) return current
      return [...current, playerId]
    })
  }

  const kickOff = async () => {
    // Unlock sound here: iOS only allows it from inside a real tap.
    primeAudio()
    const game = await createGame.mutateAsync({
      opponent: opponent.trim() || 'the other team',
      date: fromDateInputValue(date),
      settings: team.settings,
      presentPlayerIds: present.map((player) => player.id),
      lineup,
    })
    await navigate({ to: '/games/$gameId', params: { gameId: game.id } })
  }

  return (
    <Screen>
      <TopBar title="New game" back={{ to: '/' }} />

      <main className="flex flex-1 flex-col gap-5 px-5 pt-1">
        <div className="flex flex-col gap-4">
          <Field label="Playing against">
            <input
              className={inputClass}
              value={opponent}
              onChange={(event) => setOpponent(event.target.value)}
              placeholder="Blue Sharks"
              autoComplete="off"
            />
          </Field>
          <Field label="Date">
            <input
              type="date"
              className={inputClass}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel trailing={`${present.length} of ${roster.length} here`}>
            Who turned up
          </SectionLabel>
          <div className="flex flex-wrap gap-2">
            {roster.map((player) => {
              const here = !absent.has(player.id)
              return (
                <button
                  key={player.id}
                  type="button"
                  aria-pressed={here}
                  onClick={() => toggleAbsent(player.id)}
                  className={`press flex h-11 items-center gap-1.5 rounded-full px-4 text-[16px] font-semibold ${
                    here ? 'bg-pitch-mint text-pitch' : 'bg-chip text-faint line-through'
                  }`}
                >
                  {player.name}
                </button>
              )
            })}
          </div>
          <p className="px-1 text-[13px] text-faint">
            Tap anyone who is away today. They keep their season history and are simply
            left out of this game.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel
            trailing={
              <span className={lineup.length === fieldSize ? 'text-pitch' : 'text-amber'}>
                {lineup.length} of {fieldSize} picked
              </span>
            }
          >
            Starting lineup
          </SectionLabel>

          {present.length < fieldSize ? (
            <Card className="p-4 text-[14px] text-muted">
              You play {fieldSize} at a time but only {present.length} turned up. Mark
              someone as here, or lower the field size in team settings.
            </Card>
          ) : (
            <div className="grid grid-cols-2 gap-2.5">
              {present.map((player) => {
                const picked = lineupSet.has(player.id)
                return (
                  <button
                    key={player.id}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggleLineup(player.id)}
                    className={`press flex h-[72px] items-center gap-3 rounded-2xl border-2 px-3.5 text-left ${
                      picked ? 'border-pitch bg-pitch' : 'border-edge bg-card'
                    }`}
                  >
                    <span
                      className={`cond tnum flex size-9 shrink-0 items-center justify-center rounded-full text-[16px] font-bold ${
                        picked ? 'bg-white/20 text-white' : 'bg-chip text-muted'
                      }`}
                    >
                      {player.number ?? '–'}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-[17px] font-semibold ${
                        picked ? 'text-white' : 'text-ink'
                      }`}
                    >
                      {player.name}
                    </span>
                    {picked ? (
                      <span className="text-white">
                        <CheckIcon />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          )}

          <p className="px-1 text-[13px] text-faint">
            Everyone else starts on the bench. Sideline will keep offering you whoever has
            played least.
          </p>
        </div>

        <div className="flex-1" />

        <Button
          tone="action"
          size="lg"
          disabled={!ready || createGame.isPending}
          onClick={kickOff}
        >
          <PlayIcon size={22} />
          {ready
            ? 'Kick off'
            : lineup.length < fieldSize
              ? `Pick ${fieldSize - lineup.length} more`
              : 'Not enough players'}
        </Button>
      </main>
    </Screen>
  )
}
