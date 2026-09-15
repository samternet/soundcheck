/**
 * Every outbound link the app shows, in one place. Anyone running a fork only
 * needs to change the repository and support URLs here.
 */
export const REPO_URL = 'https://github.com/samternet/soundcheck'

export const LINKS = {
  repository: REPO_URL,
  issues: `${REPO_URL}/issues`,
  releases: `${REPO_URL}/releases`,
  license: `${REPO_URL}/blob/main/LICENSE`,
  author: 'https://github.com/samternet',
  support: 'https://buymeacoffee.com/samternet',
  jellyfin: 'https://jellyfin.org',
  lucide: 'https://lucide.dev',
} as const

/** A URL without its scheme, for showing people where a link goes. */
export const displayUrl = (url: string) => url.replace(/^https?:\/\//, '')
