import { monthFullNames, months, weekdayFullNames, weekdayLabels } from './constants'

const MS_PER_SECOND = 1000
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MINUTES_PER_HOUR = 60
const HOURS_PER_DAY = 24
const DAYS_PER_WEEK = 7

/**
 * Numbers follow the viewer's own locale for digit grouping (`undefined` tells
 * Intl to use the browser's setting). Dates deliberately do not; see the date
 * helpers below.
 */
const LOCALE = undefined

export function formatNumber(n: number) {
  return Number(n || 0).toLocaleString(LOCALE)
}

/**
 * A duration as minutes, rolling over to hours: "45 min", "1h 20m", "2h".
 * Used for both totals and session lengths — this was previously duplicated as
 * two byte-identical functions, `formatMinutes` and `formatSession`.
 */
export function formatMinutes(ms: number) {
  const totalMinutes = Math.round((ms || 0) / MS_PER_MINUTE)
  if (totalMinutes < MINUTES_PER_HOUR) return `${totalMinutes} min`
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR)
  const minutes = totalMinutes % MINUTES_PER_HOUR
  return minutes ? `${hours}h ${minutes}m` : `${hours}h`
}

/** Track length as a clock reading: "3:07". */
export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.round((ms || 0) / MS_PER_SECOND))
  const minutes = Math.floor(totalSeconds / MINUTES_PER_HOUR)
  const seconds = totalSeconds % MINUTES_PER_HOUR
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** Hours as a headline figure: one decimal below 10, whole numbers above. */
export function formatHours(ms: number) {
  const hours = (ms || 0) / MS_PER_HOUR
  return hours < 10 ? hours.toFixed(1) : Math.round(hours).toLocaleString(LOCALE)
}

/** Compact hours for a chart axis: "40m", "2h", "2.5h". */
export function formatAxisHours(hours: number) {
  return hours < 1
    ? `${Math.round(hours * MINUTES_PER_HOUR)}m`
    : `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`
}

/** "Just now", "5m ago", "3h ago", "2d ago", then an absolute date past a week. */
export function formatRelativeTime(ms: number) {
  if (!ms) return '—'
  const diff = Date.now() - ms
  if (diff < MS_PER_MINUTE) return 'Just now'
  const minutes = Math.floor(diff / MS_PER_MINUTE)
  if (minutes < MINUTES_PER_HOUR) return `${minutes}m ago`
  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  if (hours < HOURS_PER_DAY) return `${hours}h ago`
  const days = Math.floor(hours / HOURS_PER_DAY)
  if (days < DAYS_PER_WEEK) return `${days}d ago`
  return formatDayMonth(ms)
}

/*
 * Dates are always written day first with the month as a word: "11 Sep 2026".
 *
 * They used to follow the browser's language setting, so a browser set to US
 * English showed "9/11/2026", which people almost everywhere else read as
 * 9 November. A spelled-out month can't be misread in any country, so dates
 * are built by hand instead of through toLocaleDateString.
 */

/** JavaScript weeks start on Sunday; the app's weekday lists start on Monday. */
const mondayFirstDay = (date: Date) => (date.getDay() + 6) % 7

/** "11 Sep 2026" */
export function formatDate(value: number | Date) {
  const date = new Date(value)
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

/** "11 Sep", or "11 September" with `long`. */
export function formatDayMonth(value: number | Date, { long = false } = {}) {
  const date = new Date(value)
  const month = (long ? monthFullNames : months)[date.getMonth()]
  return `${date.getDate()} ${month}`
}

/** "Friday, 11 September" */
export function formatWeekdayDayMonth(value: number | Date) {
  const date = new Date(value)
  return `${weekdayFullNames[mondayFirstDay(date)]}, ${formatDayMonth(date, { long: true })}`
}

/** "Fri" */
export function formatWeekdayShort(value: number | Date) {
  return weekdayLabels[mondayFirstDay(new Date(value))]
}

/** "September" */
export function formatMonthName(value: number | Date) {
  return monthFullNames[new Date(value).getMonth()]
}
