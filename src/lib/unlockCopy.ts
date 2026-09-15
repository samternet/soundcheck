// Rotating copy for locked modules, picked once per mount the same way
// narrative.ts picks its sentence pools — a fresh random line on every visit
// rather than the same static message forever.
export function weekLockedCopy(days: number): string[] {
  return [
    `Your Week is still taking shape — ${days} more day${days === 1 ? '' : 's'} of listening and your pattern reveals itself.`,
    `Give it ${days} more day${days === 1 ? '' : 's'}. That's all it takes for Sound Capsule to know if you're a night owl or an early riser.`,
    `${days} day${days === 1 ? '' : 's'} left before this turns into something worth looking at. Every play counts toward it.`,
  ]
}

export function heatmapLockedCopy(days: number): string[] {
  return [
    `This fills in as a real shape once you've got more days behind you — ${days} to go.`,
    `${days} more day${days === 1 ? '' : 's'} and this stops looking like a sparse grid and starts looking like you.`,
    `Your sound has more sides than we can show yet. ${days} day${days === 1 ? '' : 's'} until the full picture.`,
  ]
}

export function monthlyLockedCopy(days: number): string[] {
  return [
    `One more stretch of listening turns this from "early days" into an actual trend. ${days} day${days === 1 ? '' : 's'} to go.`,
    `${days} day${days === 1 ? '' : 's'} out from your first full month on record — worth the wait.`,
  ]
}

export function fullLockedCopy(days: number): string[] {
  return [
    `The last stretch. ${days} day${days === 1 ? '' : 's'} and every corner of Sound Capsule opens up.`,
    `${days} day${days === 1 ? '' : 's'} left until nothing's held back anymore.`,
  ]
}

export function pickCopy(pool: string[]): string {
  return pool[Math.floor(Math.random() * pool.length)]
}

// A guaranteed one-time, then-never-again easter egg on the Genre Timeline's
// first real reveal (day 15+). Deliberately doesn't name the artist or the
// year — just the phrase itself, worded to pass as ordinary encouragement.
const EASTER_EGG_KEY = 'capsule-seen-nggyu'
const EASTER_EGG_LINE = "We're never gonna give you up on this one — it just unlocked for good."

export function takeEasterEggIfUnseen(): string | null {
  try {
    if (localStorage.getItem(EASTER_EGG_KEY)) return null
    localStorage.setItem(EASTER_EGG_KEY, '1')
    return EASTER_EGG_LINE
  } catch {
    return null
  }
}
