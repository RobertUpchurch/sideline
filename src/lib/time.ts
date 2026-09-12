/** Formatting helpers. Everything the coach reads is minutes and seconds. */

export const SECOND = 1000
export const MINUTE = 60 * SECOND

/** `7:42`, or `12:05`. Rounds down, so a clock never shows time it has not used. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** `+1:20` or `−0:35`, using a real minus sign so the columns line up. */
export function formatDelta(ms: number): string {
  const sign = ms < 0 ? '−' : '+'
  return `${sign}${formatClock(Math.abs(ms))}`
}

/** `15 min`, for settings rows where seconds would be noise. */
export function formatMinutes(ms: number): string {
  const minutes = ms / MINUTE
  return Number.isInteger(minutes) ? `${minutes} min` : `${minutes.toFixed(1)} min`
}

/** `Sat 13 Sep`, in the phone's own locale. */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

/** `13 Sep 2026`, for places where the year matters. */
export function formatLongDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** `<input type="date">` wants `YYYY-MM-DD` in local time. */
export function toDateInputValue(ts: number): string {
  const date = new Date(ts)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** Read `YYYY-MM-DD` back as local midday, which no timezone can shift a day. */
export function fromDateInputValue(value: string): number {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return Date.now()
  return new Date(year, month - 1, day, 12, 0, 0, 0).getTime()
}
