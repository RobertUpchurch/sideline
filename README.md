# Sideline

**[sideline.robupchurch.dev](https://sideline.robupchurch.dev)**

A free sub timer for youth soccer coaches. It runs the game clock, tracks how long every
child has actually played, and tells you who to bring on next so the minutes land evenly.

Built for the reality of a kindergarten touchline: one hand, bright sun, no signal, and a
parent asking why their kid is still on the bench.

- **Runs the clock.** Periods, the break between them, pauses, and stoppage time you add
  when the referee does.
- **Keeps time fair.** Every child's minutes are tracked live. The bench is always sorted
  by who has played least, and a substitution is two taps.
- **Suggests the next swap.** The child who has played most comes off for the child who
  has played least. Accept it or ignore it.
- **Keeps score.** Tap a player then Goal to credit a scorer, or log a goal with no scorer
  when nobody could tell. The other team gets a plus button and nothing else.
- **Remembers the season.** Per-game minutes tables and per-child averages, measured only
  over the games they were available for.
- **Works offline.** Install it to your home screen and it opens like an app with no
  signal at all.

## Privacy

There is no server, no account, and no analytics. Your roster and your games are stored in
your own browser and never leave the device unless you export them yourself. That is also
the catch: clearing your browser data deletes them, so use **Back up this team** in team
settings before you change phones.

## Running it locally

```bash
npm install
npm run dev
```

Other scripts: `npm test` runs the engine tests, `npm run build` produces `dist/`,
`npm run typecheck` checks types, and `npm run icons` regenerates the app icons.

## Hosting it for your league

Sideline is a static site. It costs nothing to host and has no backend to run. Deploy it
to Vercel, Netlify, Cloudflare Pages, GitHub Pages, or any static host.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRobertUpchurch%2Fsideline)

The instance at [sideline.robupchurch.dev](https://sideline.robupchurch.dev) is free for
any coach to use. The in-app share screen renders a QR code of whatever address the app is
served from, so a copy you host hands out your own link with nothing to configure.

## How it works

The whole app is built on one idea: **the game event log is the only truth.** Starting a
period, pausing, a substitution, a goal — each is an event with a wall-clock timestamp.
The clock, who is on the field, and every child's minutes are all derived by folding that
log, and nothing is ever stored pre-computed.

That is what makes the awkward cases correct rather than approximately correct. A phone
that sleeps for ten minutes wakes up with the right time, because elapsed time is the
difference between two timestamps and not a counter that has to keep ticking. A
substitution made at halftime costs nobody anything, because time only accrues inside the
stretches where the clock was actually running. Undo is just dropping the last event.

The engine lives in [`src/engine`](src/engine) as plain TypeScript with no React and no
database in sight, which is why it can be tested properly:

| File | What it answers |
| --- | --- |
| [`clock.ts`](src/engine/clock.ts) | What does the clock say right now? |
| [`playtime.ts`](src/engine/playtime.ts) | How long has each child played? |
| [`fairness.ts`](src/engine/fairness.ts) | Who should come on next? |
| [`reports.ts`](src/engine/reports.ts) | How is the season adding up? |

Everything else is the interface over it: TanStack Router for the screens, TanStack Query
over Dexie for reads and writes, TanStack Store for the shared ticking clock, TanStack
Form for the forms and TanStack Table for the two sortable tables. Tailwind for styling
and `vite-plugin-pwa` for the service worker and manifest.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Bug reports from actual touchlines are the most
useful thing you can send.

## Licence

MIT. See [LICENSE](LICENSE).
