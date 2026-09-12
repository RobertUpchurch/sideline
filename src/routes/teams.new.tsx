import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useForm } from '@tanstack/react-form'
import { z } from 'zod'
import { DEFAULT_SETTINGS, TEAM_COLORS } from '~/db/schema'
import { useCreateTeam } from '~/db/queries'
import {
  Button,
  Card,
  CheckIcon,
  Field,
  inputClass,
  Screen,
  SectionLabel,
  Stepper,
  TopBar,
} from '~/components/ui'

const schema = z.object({
  name: z.string().trim().min(1, 'Your team needs a name.').max(40, 'That name is a bit long.'),
  color: z.string(),
  fieldSize: z.number().int().min(1).max(11),
  periods: z.number().int().min(1).max(6),
  periodMinutes: z.number().int().min(1).max(45),
})

export const Route = createFileRoute('/teams/new')({
  component: NewTeam,
})

function NewTeam() {
  const navigate = useNavigate()
  const createTeam = useCreateTeam()

  const form = useForm({
    defaultValues: {
      name: '',
      color: TEAM_COLORS[0] as string,
      fieldSize: DEFAULT_SETTINGS.fieldSize,
      periods: DEFAULT_SETTINGS.periods,
      periodMinutes: Math.round(DEFAULT_SETTINGS.periodMs / 60_000),
    },
    validators: { onChange: schema },
    onSubmit: async ({ value }) => {
      const team = await createTeam.mutateAsync({
        name: value.name.trim(),
        color: value.color,
        settings: {
          ...DEFAULT_SETTINGS,
          fieldSize: value.fieldSize,
          periods: value.periods,
          periodMs: value.periodMinutes * 60_000,
        },
      })
      await navigate({ to: '/teams/$teamId/roster', params: { teamId: team.id } })
    },
  })

  return (
    <Screen>
      <TopBar title="New team" back={{ to: '/' }} />
      <form
        className="flex flex-1 flex-col gap-5 px-5 pt-1"
        onSubmit={(event) => {
          event.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="name">
          {(field) => (
            <Field
              label="Team name"
              hint="What the kids call themselves."
              error={field.state.meta.isTouched ? field.state.meta.errors[0]?.message : undefined}
            >
              <input
                className={inputClass}
                value={field.state.value}
                onBlur={field.handleBlur}
                onChange={(event) => field.handleChange(event.target.value)}
                placeholder="Green Geckos"
                autoComplete="off"
                autoFocus
              />
            </Field>
          )}
        </form.Field>

        <form.Field name="color">
          {(field) => (
            <Field label="Team colour" hint="Used on the home screen and on saved games.">
              <div className="flex gap-1">
                {TEAM_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={`Choose ${color}`}
                    aria-pressed={field.state.value === color}
                    onClick={() => field.handleChange(color)}
                    className="press flex size-11 items-center justify-center rounded-xl"
                  >
                    <span
                      className="flex size-7 items-center justify-center rounded-full"
                      style={{
                        backgroundColor: color,
                        boxShadow:
                          field.state.value === color
                            ? `0 0 0 3px #fff, 0 0 0 5px ${color}`
                            : undefined,
                      }}
                    >
                      {field.state.value === color ? (
                        <span className="text-white">
                          <CheckIcon size={16} />
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </Field>
          )}
        </form.Field>

        <div className="flex flex-col gap-2">
          <SectionLabel>Game format</SectionLabel>
          <Card className="overflow-hidden">
            <div className="flex flex-col divide-y divide-divider">
              <form.Field name="periods">
                {(field) => (
                  <Stepper
                    label="Periods"
                    hint="Two halves, or four quarters."
                    value={field.state.value}
                    min={1}
                    max={6}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
              <form.Field name="periodMinutes">
                {(field) => (
                  <Stepper
                    label="Period length"
                    value={field.state.value}
                    min={1}
                    max={45}
                    onChange={field.handleChange}
                    format={(value) => `${value} min`}
                  />
                )}
              </form.Field>
              <form.Field name="fieldSize">
                {(field) => (
                  <Stepper
                    label="Players on the field"
                    hint="Your team only, keepers included if you use one."
                    value={field.state.value}
                    min={1}
                    max={11}
                    onChange={field.handleChange}
                  />
                )}
              </form.Field>
            </div>
          </Card>
          <p className="px-1 text-[13px] text-faint">
            You can change any of this later, and every game keeps the settings it was
            played under.
          </p>
        </div>

        <div className="flex-1" />

        <form.Subscribe selector={(state) => [state.canSubmit, state.isSubmitting] as const}>
          {([canSubmit, isSubmitting]) => (
            <Button type="submit" tone="primary" size="lg" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? 'Creating…' : 'Create team'}
            </Button>
          )}
        </form.Subscribe>
      </form>
    </Screen>
  )
}
