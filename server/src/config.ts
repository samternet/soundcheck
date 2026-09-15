import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)

// Single source of truth for the version. Both the /api/health payload and the
// Authorization header Jellyfin records against this client used to carry
// their own hardcoded copy, which drifted (health reported 0.6.7-alpha long after
// the package moved to 0.7.x). Read it from package.json instead — it resolves to
// server/package.json in dev (src/config.ts) and /app/package.json in the image
// (dist/config.js), so there is nothing left to keep in sync by hand.
const pkg = require('../package.json') as { name: string; version: string }

export const APP_NAME = 'Soundcheck'
export const SERVICE_NAME = 'soundcheck-api'
export const VERSION: string = pkg.version

export const PORT = Number(process.env.PORT || 4000)
export const HOST = '0.0.0.0'

/** Writable volume holding the SQLite database, the encryption secret and the artwork cache. */
export const DATA_DIR = process.env.DATA_DIR || '/data'
export const DATABASE_FILE = path.join(DATA_DIR, 'soundcheck.db')
export const SECRET_FILE = path.join(DATA_DIR, '.soundcheck-secret')
export const ARTWORK_CACHE_DIR = path.join(DATA_DIR, 'artwork-cache')

/** Name of the header (and matching cookie) carrying a Soundcheck web session. */
export const SESSION_HEADER = 'x-soundcheck-session'
export const SESSION_COOKIE = 'soundcheck_session'
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** Every outbound Jellyfin call is bounded so one unresponsive server cannot stall a request. */
export const JELLYFIN_TIMEOUT_MS = 10_000

/**
 * Jellyfin identifies each client by DeviceId. Soundcheck issues a unique one
 * per login so a second sign-in never invalidates the token an already-open tab
 * is using; these prefixes only make the rows readable in Jellyfin's device list.
 */
export const DEVICE_ID_PREFIX = 'sc'
export const ADMIN_DEVICE_ID_PREFIX = 'sc-admin'

/** Artwork sizes the proxy serves: thumbnails by default, `full` for modal hero art. */
export type ArtworkSize = 'sm' | 'full'

/** Artwork is immutable per item+size, so it is safe to cache hard in the browser. */
export const ARTWORK_CACHE_CONTROL = 'private, max-age=86400, stale-while-revalidate=604800'
export const PROFILE_CACHE_CONTROL = 'private, max-age=86400, immutable'

/** Calendar years accepted from a query string, guarding the SQL date filters. */
export const MIN_YEAR = 2000
export const MAX_YEAR = 2100

export const ERR_NOT_AUTHENTICATED = 'Not authenticated'
