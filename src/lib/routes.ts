/**
 * The app's routes, defined once.
 *
 * The seven view names used to be written out as an inline union type in two
 * function signatures here plus every component that passed a view around, and
 * the path mapping existed twice — an if/else chain one way and a seven-level
 * nested ternary the other. Both directions are now derived from this table, so
 * adding a page means adding one line.
 */
export const ROUTES = {
  home: '/dashboard',
  activity: '/activity',
  'top-tracks': '/toptracks',
  'top-albums': '/topalbums',
  'top-artists': '/topartists',
  genres: '/genres',
  about: '/about',
  settings: '/settings',
} as const

export type View = keyof typeof ROUTES

const DEFAULT_VIEW: View = 'home'

const VIEW_BY_PATH = new Map<string, View>(
  (Object.entries(ROUTES) as [View, string][]).map(([view, path]) => [path, view]),
)

/** Maps a browser path back to a view, falling back to the dashboard. */
export function routeFromPath(path: string): View {
  return VIEW_BY_PATH.get(path) ?? DEFAULT_VIEW
}

/** The canonical path to push to history for a view. */
export function pathForView(view: View): string {
  return ROUTES[view] ?? ROUTES[DEFAULT_VIEW]
}
