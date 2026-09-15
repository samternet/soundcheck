export type Theme = 'light' | 'dark'

const KEY = 'capsule-theme'

// Kept in sync with --surface-page in styles.css, so the browser chrome on mobile
// matches the app ground instead of flashing the wrong colour behind it.
const CHROME: Record<Theme, string> = { light: '#fbf6ec', dark: '#16121a' }

export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : null
  } catch {
    return null
  }
}

export function systemTheme(): Theme {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(): Theme {
  return storedTheme() ?? systemTheme()
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', CHROME[theme])
}

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme)
  } catch {}
  applyTheme(theme)
}

// Follow the OS only until the user makes an explicit choice; after that their
// pick wins on this device forever.
export function watchSystemTheme(onChange: (theme: Theme) => void) {
  const mq = window.matchMedia?.('(prefers-color-scheme: dark)')
  if (!mq) return () => {}
  const handler = () => {
    if (!storedTheme()) onChange(systemTheme())
  }
  mq.addEventListener('change', handler)
  return () => mq.removeEventListener('change', handler)
}
