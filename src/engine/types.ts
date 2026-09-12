/**
 * Domain types for Sideline.
 *
 * The game event log is the single source of truth. Everything a coach sees
 * during a game — the clock, who is on the field, how long each child has
 * played — is derived by folding that log. Nothing is stored pre-computed, so
 * a reload, a locked phone or a killed app can never disagree with reality.
 */

export type Id = string

export interface TeamSettings {
  /** Number of periods in a game. Two halves by default. */
  periods: number
  /** Length of one period, before any stoppage time is added. */
  periodMs: number
  /** Length of the break between periods. */
  breakMs: number
  /** How many players from this team are on the field at once. */
  fieldSize: number
  /** Quick-add stoppage amounts offered on the live clock. */
  stoppageIncrementsMs: number[]
}

export interface Team {
  id: Id
  name: string
  color: string
  settings: TeamSettings
  createdAt: number
}

export interface Player {
  id: Id
  teamId: Id
  name: string
  /** Jersey number. Optional — plenty of kindergarten kits have none. */
  number: number | null
  /** False when a child has left the team. Absence for one game is per-game. */
  active: boolean
  createdAt: number
}

export type GameStatus = 'setup' | 'live' | 'final'

export interface Game {
  id: Id
  teamId: Id
  opponent: string
  /** Kick-off date, as an epoch timestamp. */
  date: number
  status: GameStatus
  /** Settings copied at creation, so later edits never rewrite history. */
  settings: TeamSettings
  /** Players available for this game. Kids who are away are left out. */
  presentPlayerIds: Id[]
  createdAt: number
  finalizedAt: number | null
}

export type GameEventType =
  | 'lineup_set'
  | 'period_start'
  | 'pause'
  | 'resume'
  | 'period_end'
  | 'stoppage_added'
  | 'sub'
  | 'goal_us'
  | 'goal_them'
  | 'player_joined'
  | 'game_end'

interface BaseEvent {
  id: Id
  gameId: Id
  /** Monotonic within a game. Breaks ties when two events share a timestamp. */
  seq: number
  /** Wall-clock time, epoch ms. */
  ts: number
}

export type GameEvent = BaseEvent &
  (
    | { type: 'lineup_set'; playerIds: Id[] }
    | { type: 'period_start'; period: number }
    | { type: 'pause' }
    | { type: 'resume' }
    | { type: 'period_end'; period: number }
    | { type: 'stoppage_added'; period: number; ms: number }
    | { type: 'sub'; onPlayerId: Id; offPlayerId: Id }
    /*
     * Goals are the team's. Kindergarten goals are a scramble, the coach is
     * watching the clock, and crediting one five-year-old over another is not
     * something this app should be in the business of.
     */
    | { type: 'goal_us' }
    | { type: 'goal_them' }
    /*
     * A child who was marked away turns up after the game has started.
     *
     * `creditMs` is the handicap the coach granted at that moment — normally
     * the average the rest of the team has played so far. Without it a late
     * arrival shows as zero minutes, sits at the top of the bench for the rest
     * of the game and ends up with far more time than anyone else.
     *
     * It is stored rather than recomputed because it is a decision, not a
     * measurement: the same kind of fact as a substitution.
     */
    | { type: 'player_joined'; playerId: Id; creditMs: number }
    | { type: 'game_end' }
  )

/**
 * An event on its way into the log, before the store stamps it.
 *
 * `Omit` collapses a discriminated union into its common keys, which would let
 * a `sub` be written with a `period`. Distributing it over each member keeps
 * every event's own fields required and exclusive.
 */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export type DraftGameEvent = OmitEach<GameEvent, 'id' | 'gameId' | 'seq' | 'ts'> & {
  /** Defaults to now. Set it only when backfilling a known moment. */
  ts?: number
}

export type ClockPhase = 'pregame' | 'running' | 'paused' | 'break' | 'final'

export interface ClockState {
  phase: ClockPhase
  /** 1-based. The period in progress, just finished, or about to start. */
  period: number
  /** Time played in the current period, excluding pauses. */
  elapsedMs: number
  /** Time left in the current period, including stoppage. Never negative. */
  remainingMs: number
  /** Stoppage added to the current period. */
  stoppageMs: number
  /** Full length of the current period, stoppage included. */
  periodLengthMs: number
  /** Time left in the break. Only meaningful while the phase is `break`. */
  breakRemainingMs: number
  /** True when the period clock is advancing right now. */
  isRunning: boolean
  /** True once the final period has ended. */
  isComplete: boolean
}

export interface PlayerTime {
  playerId: Id
  /**
   * Time actually spent on the field, counting only a running clock.
   *
   * This is the honest figure, and the one every report uses. It never
   * includes a late arrival's handicap.
   */
  totalMs: number
  /**
   * Handicap granted on arriving late. Zero for everyone who was there at
   * kick off. Added to `totalMs` when deciding who plays next, never when
   * reporting what was played.
   */
  creditMs: number
  onField: boolean
  /** Running time since this player last came on. Zero when on the bench. */
  currentStintMs: number
  /** Running time since this player last went off. Zero when on the field. */
  benchMs: number
}
