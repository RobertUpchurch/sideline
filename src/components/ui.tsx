import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { haptic } from '~/lib/haptics'

/**
 * The handful of primitives every screen is built from.
 *
 * Nothing here is a general-purpose component library. Each piece exists
 * because two or more screens needed exactly it, and every tappable one is at
 * least 44 pixels tall because this app is used one-handed, outdoors, while
 * holding a clipboard.
 */

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div
      /*
       * A frame pinned to all four edges, rather than anything sized in `dvh`.
       *
       * `100dvh` is not dependable in an installed iOS app: with
       * `viewport-fit=cover` it can resolve shorter than the screen actually
       * is, which shows as a strip of bare background at the bottom that
       * comes and goes as the keyboard or the toolbars move. An element at
       * `inset: 0` always matches the visual viewport exactly, so there is no
       * arithmetic to get wrong.
       *
       * The safe area is the whole of the top padding on a phone, which is
       * what keeps the header clear of the Dynamic Island. The floor only
       * applies where there is no inset at all — a browser with its own
       * chrome, or a desktop — so it can be slight.
       */
      className="fixed inset-0 mx-auto flex w-full max-w-[430px] flex-col bg-ground pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[max(0.5rem,env(safe-area-inset-top))]"
    >
      {children}
    </div>
  )
}

/**
 * The part of a screen that scrolls, under a header that does not.
 *
 * The document itself never scrolls — see the note in `styles.css` — so the
 * scrolling has to happen somewhere, and this is it. Two of these utilities
 * are load-bearing rather than decorative: `min-h-0` is what allows a flex
 * child to be shorter than its own content and therefore scroll at all
 * (without it the region simply grows and the frame overflows), and
 * `overscroll-contain` stops a flick that reaches the end of a list from
 * being handed onwards to the page behind it.
 *
 * These are utilities on the element and not a class in the stylesheet on
 * purpose: an unlayered rule would win over any `overflow-` utility a screen
 * set on the same element, and the live game screen needs exactly that.
 */
export function Body({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <main
      className={`flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain ${className}`}
    >
      {children}
    </main>
  )
}

export function TopBar({
  title,
  back,
  backLabel = 'Back',
  action,
}: {
  title?: ReactNode
  back?: { to: string; params?: Record<string, string> }
  backLabel?: string
  action?: ReactNode
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between gap-2 px-2">
      <div className="flex min-w-[72px] justify-start">
        {back ? (
          <Link
            to={back.to}
            params={back.params}
            className="flex h-11 items-center gap-0.5 rounded-xl px-2 font-semibold text-pitch"
          >
            <ChevronLeftIcon />
            {backLabel}
          </Link>
        ) : null}
      </div>
      <h1 className="cond truncate text-[22px] font-bold">{title}</h1>
      <div className="flex min-w-[72px] justify-end">{action}</div>
    </header>
  )
}

export function SectionLabel({
  children,
  trailing,
}: {
  children: ReactNode
  trailing?: ReactNode
}) {
  return (
    <div className="flex items-baseline justify-between px-1">
      <h2 className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
        {children}
      </h2>
      {trailing ? <div className="text-[13px] text-faint">{trailing}</div> : null}
    </div>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-edge bg-card ${className}`}>{children}</div>
  )
}

export function List({ children }: { children: ReactNode }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col [&>*]:border-b [&>*]:border-divider [&>*:last-child]:border-b-0">
        {children}
      </div>
    </Card>
  )
}

/**
 * A button that ticks under the thumb when it is pressed.
 *
 * It is a `<label>` wrapping a one-pixel checkbox because on iOS that is the
 * only way to reach the Taptic engine from a web page: Safari plays the
 * system haptic when a person toggles an `<input type="checkbox" switch>`,
 * and there is no API that will do it on request. A tap anywhere in the
 * label is a real activation of that switch, which is what earns the tick; a
 * scripted `.click()` would get nothing. See `lib/haptics.ts`.
 *
 * The checkbox is never actually checked — these are momentary actions, not
 * settings — so `checked` stays false and React resets it after every tap.
 *
 * Assistive technology is shown the label as a button and the input is hidden
 * from it, because "goal for us" is an action and announcing it as a switch
 * that is currently off would be a lie. That leaves the keyboard, which the
 * label does not handle natively, so Enter and Space are wired up by hand.
 *
 * Everything visible belongs to the label. `children` is the real button.
 */
export function HapticButton({
  label,
  onTap,
  disabled,
  className = '',
  children,
}: {
  label: string
  onTap: () => void
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  const fire = () => {
    if (disabled) return
    haptic()
    onTap()
  }

  return (
    <label
      role="button"
      aria-label={label}
      aria-disabled={disabled}
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        fire()
      }}
      className={`relative ${disabled ? 'pointer-events-none' : ''} ${className}`}
    >
      <input
        type="checkbox"
        /*
         * Not a React prop, and not something JSX will set for us. Without
         * the `switch` attribute this is an ordinary checkbox and iOS stays
         * silent.
         */
        ref={(el) => el?.setAttribute('switch', '')}
        checked={false}
        disabled={disabled}
        aria-hidden="true"
        tabIndex={-1}
        onChange={fire}
        className="pointer-events-none absolute size-px opacity-0"
      />
      {children}
    </label>
  )
}

type ButtonTone = 'primary' | 'action' | 'quiet' | 'ghost' | 'danger'

const toneClass: Record<ButtonTone, string> = {
  primary: 'bg-pitch text-white',
  action: 'bg-action text-white',
  quiet: 'bg-chip text-ink',
  ghost: 'bg-transparent text-pitch',
  danger: 'bg-transparent text-loss',
}

export function Button({
  children,
  tone = 'primary',
  size = 'md',
  disabled,
  onClick,
  type = 'button',
  className = '',
}: {
  children: ReactNode
  tone?: ButtonTone
  size?: 'md' | 'lg'
  disabled?: boolean
  onClick?: () => void
  type?: 'button' | 'submit'
  className?: string
}) {
  const height = size === 'lg' ? 'h-15 text-[19px]' : 'h-14 text-[17px]'
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`press flex ${height} items-center justify-center gap-2 rounded-2xl font-bold disabled:opacity-40 ${toneClass[tone]} ${className}`}
    >
      {children}
    </button>
  )
}

export function LinkButton({
  children,
  to,
  params,
  tone = 'primary',
  size = 'md',
  className = '',
}: {
  children: ReactNode
  to: string
  params?: Record<string, string>
  tone?: ButtonTone
  size?: 'md' | 'lg'
  className?: string
}) {
  const height = size === 'lg' ? 'h-15 text-[19px]' : 'h-14 text-[17px]'
  return (
    <Link
      to={to}
      params={params}
      className={`press flex ${height} items-center justify-center gap-2 rounded-2xl font-bold no-underline ${toneClass[tone]} ${className}`}
    >
      {children}
    </Link>
  )
}

/** A number a coach nudges up and down without ever opening a keyboard. */
export function Stepper({
  value,
  label,
  hint,
  onChange,
  min = 1,
  max = 99,
  step = 1,
  format = (value: number) => String(value),
}: {
  value: number
  label: string
  hint?: string
  onChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  format?: (value: number) => string
}) {
  return (
    <div className="flex h-[58px] items-center justify-between gap-2 pr-2 pl-4">
      <div className="flex min-w-0 flex-col">
        <span className="truncate text-[16px]">{label}</span>
        {hint ? <span className="text-[12px] text-faint">{hint}</span> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label={`Less ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - step))}
          className="press flex size-11 items-center justify-center rounded-xl bg-chip disabled:opacity-35"
        >
          <MinusIcon />
        </button>
        <span className="cond tnum w-[68px] text-center text-[24px] font-bold">
          {format(value)}
        </span>
        <button
          type="button"
          aria-label={`More ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + step))}
          className="press flex size-11 items-center justify-center rounded-xl bg-chip disabled:opacity-35"
        >
          <PlusIcon />
        </button>
      </div>
    </div>
  )
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="press flex h-11 w-[52px] shrink-0 items-center"
    >
      <span
        className={`relative block h-8 w-[52px] rounded-full transition-colors ${
          checked ? 'bg-pitch' : 'bg-edge'
        }`}
      >
        <span
          className={`absolute top-[3px] size-[26px] rounded-full bg-white shadow transition-[left] ${
            checked ? 'left-[23px]' : 'left-[3px]'
          }`}
        />
      </span>
    </button>
  )
}

/** A horizontal bar showing one player's time against the busiest player's. */
export function TimeBar({
  value,
  max,
  tone,
  className = '',
}: {
  value: number
  max: number
  tone: 'behind' | 'even' | 'ahead'
  className?: string
}) {
  const width = max > 0 ? Math.max(2, Math.round((100 * value) / max)) : 2
  const color =
    tone === 'behind' ? 'bg-amber' : tone === 'ahead' ? 'bg-action' : 'bg-pitch'
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-divider ${className}`}>
      <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${width}%` }} />
    </div>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="cond text-[22px] font-bold">{title}</p>
      <p className="max-w-[280px] text-[15px] leading-relaxed text-muted">{body}</p>
      {action}
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold tracking-[0.06em] text-muted uppercase">
        {label}
      </span>
      {children}
      {error ? (
        <span className="text-[13px] font-medium text-loss">{error}</span>
      ) : hint ? (
        <span className="text-[13px] text-faint">{hint}</span>
      ) : null}
    </label>
  )
}

export const inputClass =
  'h-14 w-full rounded-2xl border border-edge bg-card px-4 text-[17px] outline-none focus:border-pitch'

/** A date field, with room on the right for the calendar mark drawn in CSS. */
export const dateInputClass = `${inputClass} pr-12`

// --- Icons -----------------------------------------------------------------
// Drawn rather than imported so they scale, recolour and never load a font.

function icon(path: ReactNode, size: number, extra?: Record<string, string>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...extra}
    >
      {path}
    </svg>
  )
}

export const ChevronLeftIcon = ({ size = 22 }) => icon(<path d="M15 18l-6-6 6-6" />, size)
export const ChevronRightIcon = ({ size = 18 }) => icon(<path d="M9 6l6 6-6 6" />, size)
export const PlusIcon = ({ size = 20 }) => icon(<path d="M12 5v14M5 12h14" />, size)
export const MinusIcon = ({ size = 20 }) => icon(<path d="M5 12h14" />, size)
export const CheckIcon = ({ size = 22 }) => icon(<path d="M5 12l5 5L20 7" />, size)
export const CloseIcon = ({ size = 20 }) => icon(<path d="M6 6l12 12M18 6L6 18" />, size)

export const PlayIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M7 5l12 7-12 7z" />
  </svg>
)

export const PauseIcon = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
)

export const ShareIcon = ({ size = 22 }) =>
  icon(
    <>
      <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7" />
      <path d="M12 15V3" />
      <path d="M8 7l4-4 4 4" />
    </>,
    size,
  )

export const SwapIcon = ({ size = 19 }) =>
  icon(
    <>
      <path d="M7 16V4M7 4L3 8M7 4l4 4" />
      <path d="M17 8v12M17 20l4-4M17 20l-4-4" />
    </>,
    size,
  )

export const CopyIcon = ({ size = 20 }) =>
  icon(
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </>,
    size,
  )

export const PhoneIcon = ({ size = 24 }) =>
  icon(
    <>
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M11 18.5h2" />
    </>,
    size,
  )

export const WhistleIcon = ({ size = 20 }) =>
  icon(
    <>
      <circle cx="9" cy="13" r="5" />
      <path d="M14 11h7M14 15l5 3" />
    </>,
    size,
  )

export const MoreIcon = ({ size = 22 }) =>
  icon(
    <>
      <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>,
    size,
  )

export const UndoIcon = ({ size = 20 }) =>
  icon(
    <>
      <path d="M4 9h11a5 5 0 0 1 0 10h-5" />
      <path d="M8 5L4 9l4 4" />
    </>,
    size,
  )
