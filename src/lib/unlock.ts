// Gradual-unlock thresholds. Based on trackingStartedAt (when the very first
// play was ever recorded) rather than the selected year, so a person who
// starts tracking on Dec 30 keeps their progress across the Jan 1 rollover
// instead of getting reset to "day 0" by the calendar.
const THRESHOLDS = { week: 7, heatmap: 15, monthly: 30, full: 60 } as const

export type Unlocks = {
  elapsedDays: number
  week: boolean
  heatmap: boolean
  monthly: boolean
  full: boolean
  daysUntil: { week: number; heatmap: number; monthly: number; full: number }
}

export function getElapsedDays(trackingStartedAt: number | undefined | null): number {
  if (!trackingStartedAt) return 0
  return Math.max(0, Math.floor((Date.now() - trackingStartedAt) / 86400000))
}

// override: the admin-only per-account escape hatch (Settings → unlock early).
// When set, every tier reads as unlocked regardless of elapsedDays — daysUntil
// still reports the real countdown, since that's only used inside Locked's
// progress bar, which never renders once the tier is already unlocked.
export function getUnlocks(
  trackingStartedAt: number | undefined | null,
  override?: boolean,
): Unlocks {
  const elapsedDays = getElapsedDays(trackingStartedAt)
  const remaining = (threshold: number) => Math.max(0, threshold - elapsedDays)
  return {
    elapsedDays,
    week: override || elapsedDays >= THRESHOLDS.week,
    heatmap: override || elapsedDays >= THRESHOLDS.heatmap,
    monthly: override || elapsedDays >= THRESHOLDS.monthly,
    full: override || elapsedDays >= THRESHOLDS.full,
    daysUntil: {
      week: remaining(THRESHOLDS.week),
      heatmap: remaining(THRESHOLDS.heatmap),
      monthly: remaining(THRESHOLDS.monthly),
      full: remaining(THRESHOLDS.full),
    },
  }
}
