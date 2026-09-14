# Contributing to Sideline

Sideline is maintained by a volunteer coach for other volunteer coaches. The bar for a
change is simple: does it help someone run a better game for the kids on a Saturday
morning?

## The most valuable thing you can send

A bug report from an actual touchline. If the clock did something odd, if a substitution
did not land, if a child's minutes looked wrong, please open an issue and say what you
tapped and what you expected. Attach a team backup file (team settings → **Back up this
team**) if you can, since that contains the exact event log and makes the problem
reproducible.

## Running it

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # the engine tests
npm run typecheck
npm run build
```

There is deliberately no ESLint setup yet. This project is on TypeScript 7 and
`typescript-eslint` does not support it at the time of writing, and a linter that cannot
parse the code is worse than none. The type checker and the engine tests are the checks
that run in CI. If you would like to add linting once the parser catches up, that is a
welcome pull request.

## Where to make a change

The rules of the game live in `src/engine` as plain TypeScript. They take an event log and
a moment in time, and return what was true. No React, no database, no side effects.

There is one distinction worth knowing before you touch the fairness code. A child who
arrives late is credited the team average so they do not jump the queue, and that credit
is kept apart from the minutes they actually played. `adjustedMs` decides who plays next;
`playedMs` is what every report shows. Mixing them up would quietly inflate a season
average with time nobody spent on the field.

**Anything that changes what the clock says, who is on the field, how long a child has
played, or who should come on next belongs in the engine, with a test.** Those tests are
the reason the awkward cases stay correct: a phone that slept through half of the second
half, a substitution made during a stoppage, a coach who let a period run four minutes
over. Add a test that describes the situation in the language a coach would use.

The screens in `src/routes` should read state from the engine and write events to the log.
If a screen is calculating minutes itself, that calculation is in the wrong place.

## Rules the installed app imposes

Sideline spends its working life as an icon on a home screen, not as a tab. Four things
follow from that, and each is written here with the symptom that produced it — a rule
without its symptom tends to get tidied away by the next person.

- **The document must not scroll.** `html`, `body` and `#root` are `height: 100%` with
  `overflow: hidden`, every screen is a frame pinned to all four edges, and the scrolling
  happens in a region inside it (`Body` in `components/ui.tsx`). A scrollable document in
  an installed iOS app settles a few pixels taller than the viewport, which shows as the
  whole app sitting very slightly scrolled and refusing to come back. For the same
  reason, nothing is sized in `dvh`: with `viewport-fit=cover` it can resolve shorter
  than the screen really is.

- **Removing the tap highlight is a debt.** `-webkit-tap-highlight-color: transparent` is
  set on everything tappable, so the `.press` class exists to put something back. Without
  a pressed state nothing acknowledges a tap until the next screen arrives, which is what
  makes a quick app feel slow.

- **A haptic on iOS can only come from a switch.** There is no vibration API on iOS and
  never has been. The one route to the Taptic engine is that Safari plays the system
  haptic when a *person* toggles an `<input type="checkbox" switch>` — a scripted
  `.click()` gets nothing. That is why `HapticButton` is a label wrapping a one-pixel
  checkbox rather than a function you call. Use it for the things a coach does while
  watching the field: the clock, the score, a completed substitution. Not for everything.

- **A screen whose subject has gone must be replaced, not pushed away from.** Deleting a
  game or team, or blowing the final whistle, navigates with `replace: true`. Otherwise
  the dead screen sits one forward swipe away, and the loaders now answer that with a
  not-found screen rather than a blank one.

An installed app also keeps running the code it was opened with. `lib/updates.ts` looks
for a new version whenever the app comes back to the foreground, and applies it unless a
game is in progress — nobody's clock gets reloaded out from under them mid-half. The
version and commit are printed at the bottom of the about screen, which is the first
thing to ask for when a coach reports something odd.

## House style

- Plain language in the interface. "Who turned up", not "Attendance management".
- A whole line going off at once is the normal case at this age, not the exception. Any
  change to substitutions has to keep working for four players as readily as for one.
- Every tappable thing is at least 44 pixels tall. This app is used one-handed, outdoors.
- Comments explain why, not what.
- No analytics, no tracking, no accounts, no network calls after install. That is a
  promise made to every coach on the about screen, and it is not negotiable.

## Before you open a pull request

Run `npm test`, `npm run typecheck` and `npm run build`. Then actually play a game through
in a browser at phone width, including halftime, because that is where the interesting
bugs live.
