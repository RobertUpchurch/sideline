import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { teamQuery, useDeleteTeam, useUpdateTeam } from '~/db/queries'
import { TEAM_COLORS } from '~/db/schema'
import { backupFilename, exportTeam, offerFile } from '~/lib/transfer'
import {
  Button,
  Card,
  CheckIcon,
  Screen,
  SectionLabel,
  Stepper,
  TopBar,
  inputClass,
} from '~/components/ui'
import type { TeamSettings } from '~/engine/types'

export const Route = createFileRoute('/teams/$teamId/settings')({
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(teamQuery(params.teamId)),
  component: Settings,
})

const STOPPAGE_OPTIONS = [30_000, 60_000, 120_000, 180_000]

function Settings() {
  const { teamId } = Route.useParams()
  const navigate = useNavigate()
  const { data: team } = useQuery(teamQuery(teamId))
  const updateTeam = useUpdateTeam(teamId)
  const deleteTeam = useDeleteTeam()
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)

  if (!team) return null

  const patchSettings = (patch: Partial<TeamSettings>) =>
    updateTeam.mutate({ settings: { ...team.settings, ...patch } })

  const toggleStoppage = (ms: number) => {
    const current = team.settings.stoppageIncrementsMs
    const next = current.includes(ms)
      ? current.filter((value) => value !== ms)
      : [...current, ms].sort((a, b) => a - b)
    // At least one chip, otherwise the live screen loses its stoppage control.
    if (next.length === 0) return
    patchSettings({ stoppageIncrementsMs: next })
  }

  const handleBackup = async () => {
    setBusy('backup')
    try {
      const backup = await exportTeam(teamId)
      await offerFile(
        backupFilename(team.name),
        JSON.stringify(backup, null, 2),
        'application/json',
      )
    } finally {
      setBusy(null)
    }
  }

  return (
    <Screen>
      <TopBar title="Team settings" back={{ to: '/' }} />

      <main className="flex flex-1 flex-col gap-5 px-5 pt-1">
        <div className="flex flex-col gap-2">
          <SectionLabel>Team</SectionLabel>
          <Card className="flex flex-col gap-4 p-4">
            <input
              className={inputClass}
              defaultValue={team.name}
              onBlur={(event) => {
                const name = event.target.value.trim()
                if (name && name !== team.name) updateTeam.mutate({ name })
              }}
              aria-label="Team name"
            />
            <div className="flex gap-1">
              {TEAM_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Choose ${color}`}
                  aria-pressed={team.color === color}
                  onClick={() => updateTeam.mutate({ color })}
                  className="press flex size-11 items-center justify-center rounded-xl"
                >
                  <span
                    className="flex size-7 items-center justify-center rounded-full"
                    style={{
                      backgroundColor: color,
                      boxShadow:
                        team.color === color ? `0 0 0 3px #fff, 0 0 0 5px ${color}` : undefined,
                    }}
                  >
                    {team.color === color ? (
                      <span className="text-white">
                        <CheckIcon size={16} />
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>Game format</SectionLabel>
          <Card className="overflow-hidden">
            <div className="flex flex-col divide-y divide-divider">
              <Stepper
                label="Periods"
                value={team.settings.periods}
                min={1}
                max={6}
                onChange={(periods) => patchSettings({ periods })}
              />
              <Stepper
                label="Period length"
                value={Math.round(team.settings.periodMs / 60_000)}
                min={1}
                max={45}
                onChange={(minutes) => patchSettings({ periodMs: minutes * 60_000 })}
                format={(value) => `${value} min`}
              />
              <Stepper
                label="Break between periods"
                value={Math.round(team.settings.breakMs / 60_000)}
                min={0}
                max={30}
                onChange={(minutes) => patchSettings({ breakMs: minutes * 60_000 })}
                format={(value) => `${value} min`}
              />
              <Stepper
                label="Players on the field"
                value={team.settings.fieldSize}
                min={1}
                max={11}
                onChange={(fieldSize) => patchSettings({ fieldSize })}
              />
            </div>
          </Card>
          <p className="px-1 text-[13px] text-faint">
            Changing these affects new games only. Games you have already played keep the
            settings they were played under.
          </p>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>Stoppage time buttons</SectionLabel>
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-[14px] text-muted">
              Which quick-add chips appear on the live clock.
            </p>
            <div className="flex flex-wrap gap-2.5">
              {STOPPAGE_OPTIONS.map((ms) => {
                const on = team.settings.stoppageIncrementsMs.includes(ms)
                return (
                  <button
                    key={ms}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleStoppage(ms)}
                    className={`press cond flex h-11 items-center rounded-full px-4.5 text-[18px] font-bold ${
                      on ? 'bg-pitch text-white' : 'bg-chip text-muted'
                    }`}
                  >
                    +{ms < 60_000 ? `${ms / 1000}s` : `${ms / 60_000}:00`}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>

        <div className="flex flex-col gap-2">
          <SectionLabel>This team's data</SectionLabel>
          <Card className="flex flex-col gap-3 p-4">
            <p className="text-[14px] text-muted">
              Everything lives on this phone only. A backup file is how you move the team
              to a new phone, or hand it to next season's coach.
            </p>
            <Button tone="quiet" onClick={handleBackup} disabled={busy === 'backup'}>
              {busy === 'backup' ? 'Preparing…' : 'Back up this team'}
            </Button>
          </Card>
        </div>

        <div className="flex flex-col gap-2 pb-2">
          {confirmingDelete ? (
            <Card className="flex flex-col gap-3 border-loss p-4">
              <p className="font-semibold">Delete {team.name}?</p>
              <p className="text-[14px] text-muted">
                This removes the roster and every saved game for this team. It cannot be
                undone, so back up first if you might want it back.
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
                    await deleteTeam.mutateAsync(teamId)
                    await navigate({ to: '/' })
                  }}
                >
                  Delete
                </Button>
              </div>
            </Card>
          ) : (
            <Button tone="danger" onClick={() => setConfirmingDelete(true)}>
              Delete this team
            </Button>
          )}
        </div>
      </main>
    </Screen>
  )
}
