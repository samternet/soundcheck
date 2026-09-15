/**
 * The app version, injected at build time from package.json by vite.config.ts.
 *
 * The footer used to carry its own hardcoded copy of the version string, which
 * is exactly the kind of thing that silently goes stale — the server's
 * /api/health had drifted two patch versions behind package.json before this.
 */
declare const __APP_VERSION__: string

export const APP_VERSION: string =
  typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0-dev'
