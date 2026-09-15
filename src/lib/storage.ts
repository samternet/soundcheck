/**
 * Every browser-storage key the app uses, in one place. They were previously
 * inline string literals in some modules and named constants in others, which
 * made it impossible to see what Soundcheck persists without grepping.
 */
export const STORAGE_KEYS = {
  /** localStorage — the signed-in session, so a reload stays logged in. */
  session: 'soundcheck-session',
  /** localStorage — 'light' | 'dark' | 'system'. */
  theme: 'soundcheck-theme',
  /** localStorage — set once the one-time unlock easter egg has been shown. */
  easterEggSeen: 'soundcheck-seen-nggyu',
  /** sessionStorage — which insight was shown last, to rotate on revisit. */
  lastInsight: 'soundcheck-last-insight',
} as const

/**
 * Storage throws in private-browsing modes and when site data is blocked, so
 * every access goes through these instead of a bare try/catch at each call site.
 */
export const safeStorage = {
  get(storage: Storage, key: string): string | null {
    try {
      return storage.getItem(key)
    } catch {
      return null
    }
  },
  set(storage: Storage, key: string, value: string) {
    try {
      storage.setItem(key, value)
    } catch {
      /* quota exceeded or storage blocked — the feature degrades, nothing breaks */
    }
  },
  remove(storage: Storage, key: string) {
    try {
      storage.removeItem(key)
    } catch {
      /* nothing to do if storage is unavailable */
    }
  },
}
