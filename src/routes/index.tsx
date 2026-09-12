import { createFileRoute, Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { gamesQuery, liveGameQuery, playersQuery, teamsQuery } from '~/db/queries'
import { summarizeGame } from '~/engine/reports'
import { db } from '~/db/schema'
import { formatClock, formatDate } from '~/lib/time'
import {
  Card,
  ChevronRightIcon,
  EmptyState,
  LinkButton,
  PlayIcon,
  PlusIcon,
  Screen,
  SectionLabel,
  ShareIcon,
} from '~/components/ui'
import type { Team } from '~/engine/types'

export const Route = createFileRoute('/')({
  loader: ({ context }) =>
    Promise.all([
      context.queryClient.ensureQueryData(teamsQuery()),
      context.queryClient.ensureQueryData(liveGameQuery()),
    ]),
  component: Home,
})

function Home() {
  const { data: teams = [] } = useQuery(teamsQuery())
  const { data: liveGame } = useQuery(liveGameQuery())

  return (
    <Screen>
      <header className="flex h-12 items-center justify-between px-5">
        <span className="cond text-[28px] font-extrabold tracking-[0.04em] text-pitch">
          SIDELINE
        </span>
        <Link
          to="/share"
          aria-label="Share this app with another coach"
          className="press flex size-11 items-center justify-center rounded-xl border border-edge bg-card text-pitch"
        >
          <ShareIcon />
        </Link>
      </header>

      <main className="flex flex-1 flex-col gap-4 px-5 pt-1">
        {liveGame ? (
          <Link
            to="/games/$gameId"
            params={{ gameId: liveGame.id }}
            className="press flex items-center justify-between gap-3 rounded-2xl bg-action px-5 py-4 text-white no-underline"
          >
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px] font-semibold tracking-[0.06em] uppercase opacity-85">
                Game in progress
              </span>
              <span className="cond text-[22px] font-bold">vs {liveGame.opponent}</span>
            </span>
            <span className="flex items-center gap-1 font-bold">
              Resume
              <ChevronRightIcon />
            </span>
          </Link>
        ) : null}

        {teams.length === 0 ? (
          <EmptyState
            title="Let's set up your team"
            body="Add your squad once. After that, starting a game takes two taps and Sideline keeps everyone's minutes even."
            action={
              <LinkButton to="/teams/new" tone="primary" className="mt-2 px-6">
                <PlusIcon />
                Create a team
              </LinkButton>
            }
          />
        ) : (
          teams.map((team) => <TeamCard key={team.id} team={team} />)
        )}

        {teams.length > 0 ? (
          <LinkButton to="/teams/new" tone="ghost" className="border-1.5 border-dashed border-edge">
            <PlusIcon />
            New team
          </LinkButton>
        ) : null}
      </main>

      <footer className="flex flex-col items-center gap-1 px-5 pt-6">
        <Link to="/about" className="flex h-11 items-center px-3 font-semibold text-pitch">
          Add Sideline to your home screen
        </Link>
        <p className="text-[12px] text-faint">
          Free and open source. Your data stays on this phone.
        </p>
      </footer>
    </Screen>
  )
}

function TeamCard({ team }: { team: Team }) {
  const { data: players = [] } = useQuery(playersQuery(team.id))
  const { data: games = [] } = useQuery(gamesQuery(team.id))
  const activePlayers = players.filter((player) => player.active)
  const lastFinal = games.find((game) => game.status === 'final')

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-3.5">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ backgroundColor: team.color }}
        >
          <span className="cond text-[22px] font-extrabold text-white">
            {initials(team.name)}
          </span>
        </span>
        <div className="flex min-w-0 flex-col">
          <p className="cond truncate text-[24px] leading-none font-bold">{team.name}</p>
          <p className="text-[14px] text-muted">
            {activePlayers.length} {activePlayers.length === 1 ? 'player' : 'players'} ·{' '}
            {team.settings.periods} × {Math.round(team.settings.periodMs / 60_000)} min
          </p>
        </div>
      </div>

      {activePlayers.length === 0 ? (
        <LinkButton to="/teams/$teamId/roster" params={{ teamId: team.id }} tone="primary">
          <PlusIcon />
          Add your players
        </LinkButton>
      ) : (
        <LinkButton
          to="/teams/$teamId/new-game"
          params={{ teamId: team.id }}
          tone="action"
          size="lg"
        >
          <PlayIcon size={22} />
          Start game
        </LinkButton>
      )}

      <div className="grid grid-cols-3 gap-2.5">
        <SmallLink to="/teams/$teamId/roster" teamId={team.id} label="Roster" />
        <SmallLink to="/teams/$teamId/settings" teamId={team.id} label="Settings" />
        <SmallLink to="/teams/$teamId/season" teamId={team.id} label="Season" />
      </div>

      {lastFinal ? <LastGame gameId={lastFinal.id} teamId={team.id} /> : null}
    </Card>
  )
}

function SmallLink({
  to,
  teamId,
  label,
}: {
  to: string
  teamId: string
  label: string
}) {
  return (
    <Link
      to={to}
      params={{ teamId }}
      className="press flex h-12 items-center justify-center rounded-xl bg-chip font-semibold text-ink no-underline"
    >
      {label}
    </Link>
  )
}

function LastGame({ gameId, teamId }: { gameId: string; teamId: string }) {
  const { data } = useQuery({
    queryKey: ['games', gameId, 'summary'],
    queryFn: async () => {
      const game = await db.games.get(gameId)
      if (!game) return null
      const events = await db.events.where('gameId').equals(gameId).toArray()
      return summarizeGame({ game, events })
    },
  })

  if (!data) return null
  const tone =
    data.result === 'win' ? 'text-pitch' : data.result === 'loss' ? 'text-loss' : 'text-muted'

  return (
    <div className="flex flex-col gap-2">
      <SectionLabel>Last game</SectionLabel>
      <Link
        to="/teams/$teamId/season"
        params={{ teamId }}
        className="flex items-center justify-between gap-3 rounded-xl bg-chip px-4 py-3 no-underline"
      >
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-semibold text-ink">vs {data.opponent}</span>
          <span className="text-[13px] text-muted">
            {formatDate(data.date)} · spread {formatClock(data.spreadMs)}
          </span>
        </span>
        <span className={`cond tnum text-[26px] font-extrabold ${tone}`}>
          {data.ourScore}–{data.theirScore}
        </span>
      </Link>
    </div>
  )
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return '??'
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase()
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase()
}
