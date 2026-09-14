import { useRef, useState } from 'react'
import { Link, createFileRoute } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { importTeam } from '~/lib/transfer'
import {
  Body,
  Button,
  Card,
  ChevronRightIcon,
  PhoneIcon,
  Screen,
  TopBar,
} from '~/components/ui'

export const Route = createFileRoute('/about')({
  component: About,
})

const REPOSITORY_URL = 'https://github.com/RobertUpchurch/sideline'

function About() {
  const queryClient = useQueryClient()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleImport = async (file: File) => {
    setError(null)
    setMessage(null)
    try {
      const text = await file.text()
      const result = await importTeam(JSON.parse(text) as unknown, 'copy')
      await queryClient.invalidateQueries()
      setMessage(
        `Added ${result.teamName} with ${result.players} players and ${result.games} games.`,
      )
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That file could not be read.')
    }
  }

  return (
    <Screen>
      <TopBar title="Install & about" back={{ to: '/' }} />

      <Body className="gap-5 px-5 pt-1">
        <Card className="flex flex-col gap-3.5 p-4">
          <div className="flex items-center gap-2.5">
            <span className="text-pitch">
              <PhoneIcon />
            </span>
            <h2 className="cond text-[20px] font-bold">Add to your home screen</h2>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
              iPhone · Safari
            </h3>
            <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-[15px] leading-relaxed">
              <li>Tap the Share button at the bottom of Safari.</li>
              <li>
                Scroll down and tap <strong>Add to Home Screen</strong>.
              </li>
              <li>
                Tap <strong>Add</strong>. Sideline then opens like an app, with no address
                bar and no signal needed.
              </li>
            </ol>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
              Android · Chrome
            </h3>
            <ol className="flex list-decimal flex-col gap-0.5 pl-5 text-[15px] leading-relaxed">
              <li>Tap the three dots in the top right.</li>
              <li>
                Tap <strong>Add to Home screen</strong>, then <strong>Install</strong>.
              </li>
            </ol>
          </div>
        </Card>

        <Link
          to="/share"
          className="flex items-center gap-4 rounded-2xl bg-ink p-4 text-white no-underline"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-white">
            <QrGlyph />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="cond text-[20px] font-bold">Share with another coach</span>
            <span className="text-[14px] text-slate">
              Show them a QR code to scan. No typing the address.
            </span>
          </span>
          <span className="text-slate">
            <ChevronRightIcon size={20} />
          </span>
        </Link>

        <Card className="flex flex-col gap-2.5 p-4">
          <h2 className="cond text-[20px] font-bold">Free, open source, private</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            Sideline was built by a volunteer coach with the same problem you have. Your
            roster and your games are stored on this phone and nowhere else. Nothing is
            uploaded, there are no accounts, and there is nothing to pay.
          </p>
          <a
            href={REPOSITORY_URL}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 items-center font-semibold text-pitch"
          >
            Read the source on GitHub
          </a>
        </Card>

        <Card className="flex flex-col gap-3 p-4">
          <h2 className="cond text-[20px] font-bold">Moving to a new phone?</h2>
          <p className="text-[15px] leading-relaxed text-muted">
            Back a team up from its settings screen, then load that file here. Importing
            adds the team alongside anything already on this phone.
          </p>
          {message ? (
            <p className="text-[14px] font-medium text-pitch">{message}</p>
          ) : null}
          {error ? <p className="text-[14px] font-medium text-loss">{error}</p> : null}
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void handleImport(file)
              event.target.value = ''
            }}
          />
          <Button tone="quiet" onClick={() => fileInput.current?.click()}>
            Load a team from a file
          </Button>
        </Card>

        <div className="flex-1" />

        <p className="text-center text-[12px] text-faint">
          Sideline · MIT licence · no tracking, no analytics, no accounts
        </p>

        {/*
          An installed app can be a long way behind the site it came from, and
          a coach cannot tell by looking. This is the line to read back when
          something is not behaving.
        */}
        <p className="tnum pb-1 text-center text-[12px] text-faint">
          v{__APP_VERSION__} · {__BUILD_REF__}
        </p>
      </Body>
    </Screen>
  )
}

/** A small decorative QR mark. Not scannable, and not meant to be. */
function QrGlyph() {
  return (
    <svg viewBox="0 0 70 70" className="size-11" aria-hidden="true" shapeRendering="crispEdges">
      <g fill="#101B14">
        <rect x="0" y="0" width="30" height="30" />
        <rect x="40" y="0" width="30" height="30" />
        <rect x="0" y="40" width="30" height="30" />
        <rect x="40" y="40" width="10" height="10" />
        <rect x="60" y="40" width="10" height="10" />
        <rect x="50" y="50" width="10" height="10" />
        <rect x="40" y="60" width="10" height="10" />
        <rect x="60" y="60" width="10" height="10" />
      </g>
      <g fill="#FFFFFF">
        <rect x="5" y="5" width="20" height="20" />
        <rect x="45" y="5" width="20" height="20" />
        <rect x="5" y="45" width="20" height="20" />
      </g>
      <g fill="#101B14">
        <rect x="10" y="10" width="10" height="10" />
        <rect x="50" y="10" width="10" height="10" />
        <rect x="10" y="50" width="10" height="10" />
      </g>
    </svg>
  )
}
