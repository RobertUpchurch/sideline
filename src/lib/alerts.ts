/**
 * The sound and buzz that tell a coach a period is over without them having to
 * watch the screen.
 *
 * iOS will not let a page make a sound until the user has touched it, so the
 * audio context is created on the kick-off tap and reused for the rest of the
 * game.
 */

let context: AudioContext | null = null

type AudioContextCtor = typeof AudioContext

function getContextCtor(): AudioContextCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as typeof window & { webkitAudioContext?: AudioContextCtor }
  return window.AudioContext ?? w.webkitAudioContext ?? null
}

/** Call from inside a tap handler, once, before any alert is needed. */
export function primeAudio(): void {
  if (context) {
    void context.resume().catch(() => {})
    return
  }
  const Ctor = getContextCtor()
  if (!Ctor) return
  try {
    context = new Ctor()
    void context.resume().catch(() => {})
  } catch {
    context = null
  }
}

function beep(frequency: number, startAt: number, durationMs: number): void {
  if (!context) return
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.value = frequency
  // A short ramp at each end, so it reads as a whistle rather than a click.
  gain.gain.setValueAtTime(0, startAt)
  gain.gain.linearRampToValueAtTime(0.35, startAt + 0.02)
  gain.gain.setValueAtTime(0.35, startAt + durationMs / 1000 - 0.04)
  gain.gain.linearRampToValueAtTime(0, startAt + durationMs / 1000)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + durationMs / 1000)
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    try {
      navigator.vibrate(pattern)
    } catch {
      // Some browsers expose vibrate but refuse to run it. Nothing to do.
    }
  }
}

/** Three rising notes: a period has ended. */
export function alertPeriodEnd(): void {
  if (context) {
    const at = context.currentTime
    beep(660, at, 180)
    beep(880, at + 0.22, 180)
    beep(1100, at + 0.44, 320)
  }
  vibrate([180, 90, 180, 90, 320])
}

/** Two notes: the break is over, get them back out there. */
export function alertBreakEnd(): void {
  if (context) {
    const at = context.currentTime
    beep(880, at, 160)
    beep(880, at + 0.24, 260)
  }
  vibrate([160, 100, 260])
}

/** A single tick: a suggested substitution is due. */
export function alertSubDue(): void {
  if (context) beep(760, context.currentTime, 120)
  vibrate(120)
}
