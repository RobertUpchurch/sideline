import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import {
  playersQuery,
  teamQuery,
  useAddPlayer,
  useDeletePlayer,
  useUpdatePlayer,
} from '~/db/queries'
import {
  Button,
  Card,
  CloseIcon,
  EmptyState,
  Field,
  List,
  PlusIcon,
  Screen,
  SectionLabel,
  Toggle,
  TopBar,
  inputClass,
} from '~/components/ui'
import type { Player } from '~/engine/types'

export const Route = createFileRoute('/teams/$teamId/roster')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(teamQuery(params.teamId)),
      context.queryClient.ensureQueryData(playersQuery(params.teamId)),
    ]),
  component: Roster,
})

const playerSchema = z.object({
  name: z.string().trim().min(1, 'Give this player a name.').max(30, 'That name is a bit long.'),
  number: z
    .string()
    .trim()
    .refine((value) => value === '' || /^\d{1,2}$/.test(value), 'Use a number from 0 to 99.'),
})

function Roster() {
  const { teamId } = Route.useParams()
  const { data: team } = useQuery(teamQuery(teamId))
  const { data: players = [] } = useQuery(playersQuery(teamId))
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Player | null>(null)

  const active = players.filter((player) => player.active)

  return (
    <Screen>
      <TopBar title="Roster" back={{ to: '/' }} />

      <main className="flex flex-1 flex-col gap-3 px-5 pt-1">
        {players.length === 0 ? (
          <EmptyState
            title="No players yet"
            body="Add every child on the team. Sideline uses this list to keep playing time even, so include the ones who only turn up sometimes."
          />
        ) : (
          <>
            <SectionLabel
              trailing={`${active.length} on the team`}
            >
              Players
            </SectionLabel>
            <List>
              {players.map((player) => (
                <PlayerRow key={player.id} player={player} onEdit={() => setEditing(player)} />
              ))}
            </List>
            <p className="px-1 text-[13px] text-faint">
              Turning a player off keeps their history but leaves them out of new games. Use
              it when a child leaves the team, not for a single Saturday.
            </p>
          </>
        )}

        <div className="flex-1" />

        {team && active.length > 0 && active.length < team.settings.fieldSize ? (
          <Card className="p-4 text-[14px] text-muted">
            You play {team.settings.fieldSize} at a time, so you need at least{' '}
            {team.settings.fieldSize} players before a game can start.
          </Card>
        ) : null}

        <Button tone="primary" size="lg" onClick={() => setAdding(true)}>
          <PlusIcon size={22} />
          Add player
        </Button>
      </main>

      {adding ? <PlayerSheet teamId={teamId} onClose={() => setAdding(false)} /> : null}
      {editing ? (
        <PlayerSheet teamId={teamId} player={editing} onClose={() => setEditing(null)} />
      ) : null}
    </Screen>
  )
}

function PlayerRow({ player, onEdit }: { player: Player; onEdit: () => void }) {
  const updatePlayer = useUpdatePlayer(player.teamId)

  return (
    <div className="flex h-[60px] items-center gap-3 pr-3 pl-4">
      <button
        type="button"
        onClick={onEdit}
        className="press flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <span
          className={`cond tnum flex size-9 shrink-0 items-center justify-center rounded-full text-[17px] font-bold ${
            player.active ? 'bg-pitch-mint text-pitch' : 'bg-chip text-faint'
          }`}
        >
          {player.number ?? '–'}
        </span>
        <span
          className={`truncate text-[17px] font-semibold ${
            player.active ? 'text-ink' : 'text-faint'
          }`}
        >
          {player.name}
        </span>
      </button>
      <Toggle
        checked={player.active}
        label={`${player.name} is on the team`}
        onChange={(active) => updatePlayer.mutate({ id: player.id, patch: { active } })}
      />
    </div>
  )
}

function PlayerSheet({
  teamId,
  player,
  onClose,
}: {
  teamId: string
  player?: Player
  onClose: () => void
}) {
  const addPlayer = useAddPlayer(teamId)
  const updatePlayer = useUpdatePlayer(teamId)
  const deletePlayer = useDeletePlayer(teamId)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  const form = useForm({
    defaultValues: {
      name: player?.name ?? '',
      number: player?.number != null ? String(player.number) : '',
    },
    validators: { onChange: playerSchema },
    onSubmit: async ({ value }) => {
      const name = value.name.trim()
      const number = value.number.trim() === '' ? null : Number(value.number)
      if (player) await updatePlayer.mutateAsync({ id: player.id, patch: { name, number } })
      else await addPlayer.mutateAsync({ name, number })
      onClose()
    },
  })

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-ink/40" onClick={onClose}>
      <div
        className="rounded-t-3xl bg-ground px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="cond text-[22px] font-bold">
            {player ? 'Edit player' : 'Add player'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="press flex size-11 items-center justify-center rounded-xl bg-chip text-muted"
          >
            <CloseIcon />
          </button>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <form.Field name="name">
            {(field) => (
              <Field
                label="Name"
                error={
                  field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined
                }
              >
                <input
                  className={inputClass}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  placeholder="Ava"
                  autoComplete="off"
                  autoFocus={!player}
                />
              </Field>
            )}
          </form.Field>

          <form.Field name="number">
            {(field) => (
              <Field
                label="Shirt number"
                hint="Optional. Leave it blank if the kit has no numbers."
                error={
                  field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined
                }
              >
                <input
                  className={inputClass}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(event) => field.handleChange(event.target.value)}
                  inputMode="numeric"
                  placeholder="7"
                  autoComplete="off"
                />
              </Field>
            )}
          </form.Field>

          <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" tone="primary" size="lg" disabled={!canSubmit || isSubmitting}>
                {player ? 'Save' : 'Add to roster'}
              </Button>
            )}
          </form.Subscribe>
        </form>

        {player ? (
          confirmingDelete ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-loss bg-card p-4">
              <p className="text-[14px] text-muted">
                Removing {player.name} also removes them from past game reports. To leave a
                player out of new games without losing their history, switch them off
                instead.
              </p>
              <div className="flex gap-2.5">
                <Button tone="quiet" className="flex-1" onClick={() => setConfirmingDelete(false)}>
                  Cancel
                </Button>
                <Button
                  tone="action"
                  className="flex-1 !bg-loss"
                  onClick={async () => {
                    await deletePlayer.mutateAsync(player.id)
                    onClose()
                  }}
                >
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <Button tone="danger" className="mt-2" onClick={() => setConfirmingDelete(true)}>
              Remove {player.name} completely
            </Button>
          )
        ) : null}
      </div>
    </div>
  )
}
