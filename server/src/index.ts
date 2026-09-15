import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import express from 'express'
import db, {
  connectionStats,
  getConnection,
  getConnectionByServerId,
  getFirstConnection,
  removeOtherServerConnections,
  saveConnection,
  updateConnectionUrls,
  stats,
  ensureTrackingStart,
  capsuleMeta,
  setUnlockOverride,
  saveWebSession,
  deleteWebSession,
  loadActiveWebSessions,
} from './db.js'
import { encrypt, decrypt } from './crypto.js'
import {
  authenticate,
  systemInfo,
  getItem,
  getItemsByIds,
  getItemUserData,
  markFavoriteItem,
  unmarkFavoriteItem,
  getUser,
  searchItems,
  authHeaders,
  normalizeUrl,
} from './jellyfin.js'
import { pollAll, startTracker } from './tracker.js'
import {
  ARTWORK_CACHE_CONTROL,
  ARTWORK_CACHE_DIR,
  type ArtworkSize,
  DEVICE_ID_PREFIX,
  ERR_NOT_AUTHENTICATED,
  HOST,
  JELLYFIN_TIMEOUT_MS,
  MAX_YEAR,
  MIN_YEAR,
  PORT,
  PROFILE_CACHE_CONTROL,
  SERVICE_NAME,
  SESSION_COOKIE,
  SESSION_HEADER,
  SESSION_TTL_MS,
  VERSION,
} from './config.js'

const app = express()
const sessions = new Map<
  string,
  {
    connectionId: string
    userId: string
    username: string
    isAdministrator: boolean
    jellyfinToken: string
    deviceId: string
    expiresAt: number
  }
>()
void fs.mkdir(ARTWORK_CACHE_DIR, { recursive: true })

/** Largest JSON body accepted; only the media-batch endpoint sends anything sizeable. */
const MAX_JSON_BODY = '1mb'
/** Item ids accepted in one /api/media/batch call. */
const MAX_BATCH_ITEM_IDS = 130
/** Artist or album names resolved in one /api/media/batch call. */
const MAX_BATCH_NAMES = 20
/** Songs returned alongside an album or artist detail view. */
const DETAIL_TOP_SONGS = 3
/** Thumbnail bounds for cached artwork; `?size=full` bypasses these. */
const THUMBNAIL_MAX_PX = 480
const THUMBNAIL_QUALITY = 82

// No CORS middleware: the web app and this API are served from the same origin
// (nginx proxies /api, and Vite does the same in development). The previous
// `cors({ origin: true, credentials: true })` echoed back *any* website as an
// allowed origin, which this app never needed.
app.use(express.json({ limit: MAX_JSON_BODY }))
// nginx forwards the visitor's address in X-Forwarded-For; trust it only when
// the request itself arrives from a private or loopback address (the proxy).
app.set('trust proxy', 'loopback, linklocal, uniquelocal')

/**
 * Failed sign-ins allowed per client address within the window before further
 * attempts are refused. Stops password guessing through Sound Capsule, and
 * stops it from getting your users locked out by Jellyfin's own lockout.
 */
const LOGIN_MAX_FAILURES = 10
const LOGIN_WINDOW_MS = 15 * 60 * 1000

function createLoginLimiter(maxFailures: number, windowMs: number) {
  const failures = new Map<string, { count: number; resetAt: number }>()
  const current = (key: string) => {
    const entry = failures.get(key)
    if (entry && entry.resetAt <= Date.now()) {
      failures.delete(key)
      return undefined
    }
    return entry
  }
  // Drop expired entries so the map can't grow without bound.
  setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of failures) if (entry.resetAt <= now) failures.delete(key)
  }, windowMs).unref()
  return {
    /** Milliseconds until this client may try again, or 0 if not blocked. */
    blockedFor(key: string) {
      const entry = current(key)
      return entry && entry.count >= maxFailures ? entry.resetAt - Date.now() : 0
    },
    fail(key: string) {
      const entry = current(key)
      if (entry) entry.count += 1
      else failures.set(key, { count: 1, resetAt: Date.now() + windowMs })
    },
    succeed(key: string) {
      failures.delete(key)
    },
  }
}
const loginLimiter = createLoginLimiter(LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS)
const clientKey = (req: express.Request) => req.ip || req.socket.remoteAddress || 'unknown'

/** Reporting year from a query string, clamped to the range the SQL filters accept. */
function parseYear(value: unknown): number {
  return Math.max(MIN_YEAR, Math.min(MAX_YEAR, Number(value) || new Date().getFullYear()))
}

/**
 * Every play_events query is scoped to a calendar year evaluated in the
 * container's timezone (TZ), so this predicate is shared rather than retyped.
 */
const YEAR_FILTER = `strftime('%Y',started_at/1000,'unixepoch','localtime')=?`

/** Deep link into the Jellyfin web client for a known item id. */
const jellyfinItemUrl = (serverUrl: string, id: string) =>
  `${serverUrl}/web/index.html#!/details?id=${encodeURIComponent(id)}`
/** Fallback when an item could not be resolved — drop the user at a search instead. */
const jellyfinSearchUrl = (serverUrl: string, term: string) =>
  `${serverUrl}/web/index.html#!/search.html?term=${encodeURIComponent(term)}`
/**
 * Artwork is proxied through this API so a Jellyfin token never reaches the
 * browser. `size` defaults to the cached thumbnail; detail modals ask for
 * 'full' because they render the art far larger than 480px.
 */
const artworkUrl = (id: string, kind = 'Primary', size?: ArtworkSize) =>
  `/api/artwork/${encodeURIComponent(id)}?type=${encodeURIComponent(kind)}` +
  (size === 'full' ? '&size=full' : '')

const unauthorized = (res: express.Response) =>
  res.status(401).json({ error: ERR_NOT_AUTHENTICATED })

// Sessions live in-memory for fast lookups but are mirrored to the database (the
// user's personal Jellyfin token encrypted, same as the admin connection token) so a
// logged-in browser survives a container rebuild — it only ends on explicit logout or
// natural expiry, never as a side effect of redeploying.
function createSession(
  connectionId: string,
  userId: string,
  username: string,
  isAdministrator: boolean,
  jellyfinToken: string,
  deviceId: string,
) {
  const id = crypto.randomBytes(32).toString('hex')
  const expiresAt = Date.now() + SESSION_TTL_MS
  sessions.set(id, {
    connectionId,
    userId,
    username,
    isAdministrator,
    jellyfinToken,
    deviceId,
    expiresAt,
  })
  const enc = encrypt(jellyfinToken)
  saveWebSession({
    id,
    connectionId,
    jellyfinUserId: userId,
    username,
    isAdministrator,
    tokenCiphertext: enc.ciphertext,
    tokenIv: enc.iv,
    tokenTag: enc.tag,
    expiresAt,
    deviceId,
  })
  return id
}
for (const row of loadActiveWebSessions()) {
  try {
    const token = decrypt(row.token_ciphertext, row.token_iv, row.token_tag)
    sessions.set(row.id, {
      connectionId: row.connection_id,
      userId: row.jellyfin_user_id,
      username: row.username,
      isAdministrator: Boolean(row.is_administrator),
      jellyfinToken: token,
      deviceId: row.device_id || '',
      expiresAt: row.expires_at,
    })
  } catch {}
}
// Jellyfin populates ProductionYear from album/artist metadata providers (MusicBrainz etc).
// It's reliably present for albums but often absent for artists depending on the server's
// metadata source, so callers must treat the result as optional.
function productionYearOf(item: any): number | null {
  const y = Number(item?.ProductionYear)
  if (y > 1000) return y
  const p = item?.PremiereDate ? new Date(item.PremiereDate).getFullYear() : null
  return p && p > 1000 ? p : null
}
function cookieValue(req: express.Request, name: string) {
  const raw = req.header('cookie') || ''
  for (const part of raw.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}
function sessionIdFromRequest(req: express.Request) {
  return req.header(SESSION_HEADER) || cookieValue(req, SESSION_COOKIE)
}
function setSessionCookie(req: express.Request, res: express.Response, id: string) {
  const secure =
    String(req.header('x-forwarded-proto') || '')
      .split(',')[0]
      .trim() === 'https'
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(id)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`,
  )
}
function clearSessionCookie(res: express.Response) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`)
}
function auth(req: express.Request) {
  const id = sessionIdFromRequest(req)
  if (!id) return null
  const s = sessions.get(id)
  if (!s || s.expiresAt < Date.now()) {
    if (id) {
      sessions.delete(id)
      deleteWebSession(id)
    }
    return null
  }
  return s
}
function userConnection(req: express.Request) {
  const s = auth(req)
  if (!s) return null
  const c = getConnection(s.connectionId)
  return c ? { session: s, connection: c } : null
}
function requireAdmin(req: express.Request, res: express.Response) {
  const uc = userConnection(req)
  if (!uc) {
    res.status(401).json({ error: ERR_NOT_AUTHENTICATED })
    return null
  }
  if (!uc.session.isAdministrator) {
    res.status(403).json({ error: 'Administrator access required' })
    return null
  }
  return uc
}

function jellyfinAuthFor(req: express.Request) {
  const uc = userConnection(req)
  if (!uc) return null
  try {
    const token = decrypt(
      uc.connection.token_ciphertext,
      uc.connection.token_iv,
      uc.connection.token_tag,
    )
    return { ...uc, token, deviceId: uc.connection.device_id || '' }
  } catch {
    return null
  }
}

function userJellyfinAuthFor(req: express.Request) {
  const uc = userConnection(req)
  if (!uc || !uc.session.jellyfinToken) return null
  return { ...uc, token: uc.session.jellyfinToken, deviceId: uc.session.deviceId || '' }
}

app.get('/api/media/resolve', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  if (!jc) return unauthorized(res)
  const type = String(req.query.type || '') as 'MusicArtist' | 'MusicAlbum'
  const name = String(req.query.name || '').trim()
  const artist = String(req.query.artist || '').trim()
  if (!['MusicArtist', 'MusicAlbum'].includes(type) || !name)
    return res.status(400).json({ error: 'type and name are required' })
  const items = await searchItems(
    jc.connection.server_url,
    jc.token,
    jc.session.userId,
    name,
    type,
    jc.deviceId,
  )
  const exact =
    items.find(
      (x: any) =>
        String(x.Name || '').toLowerCase() === name.toLowerCase() &&
        (!artist ||
          String(x.AlbumArtist || x.Artists?.[0] || '').toLowerCase() === artist.toLowerCase()),
    ) ||
    items.find((x: any) => String(x.Name || '').toLowerCase() === name.toLowerCase()) ||
    items[0]
  if (!exact) return res.status(404).json({ error: 'Jellyfin item not found' })
  const id = String(exact.Id || '')
  res.json({
    id,
    name: String(exact.Name || name),
    type: String(exact.Type || type),
    artwork: exact.ImageTags?.Primary ? `/api/artwork/${encodeURIComponent(id)}` : null,
    jellyfinUrl: jellyfinItemUrl(jc.connection.server_url, id),
  })
})

app.post('/api/media/batch', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  if (!jc) return unauthorized(res)
  const itemIds = Array.isArray(req.body?.itemIds)
    ? req.body.itemIds.map(String).slice(0, MAX_BATCH_ITEM_IDS)
    : []
  const artistNames = Array.isArray(req.body?.artistNames)
    ? req.body.artistNames.map(String).filter(Boolean).slice(0, MAX_BATCH_NAMES)
    : []
  const albumName = String(req.body?.albumName || '').trim()
  const albumArtist = String(req.body?.albumArtist || '').trim()
  const albumsInput = Array.isArray(req.body?.albums)
    ? req.body.albums
        .slice(0, MAX_BATCH_NAMES)
        .map((x: any) => ({
          name: String(x?.name || '').trim(),
          artist: String(x?.artist || '').trim(),
        }))
        .filter((x: any) => x.name)
    : []
  try {
    const items = await getItemsByIds(
      jc.connection.server_url,
      jc.token,
      jc.session.userId,
      itemIds,
      jc.deviceId,
    )
    const relatedIds = new Set<string>()
    for (const item of items) {
      if (item.AlbumId) relatedIds.add(String(item.AlbumId))
      if (Array.isArray(item.ArtistItems))
        for (const artist of item.ArtistItems) if (artist?.Id) relatedIds.add(String(artist.Id))
    }
    const related = await getItemsByIds(
      jc.connection.server_url,
      jc.token,
      jc.session.userId,
      [...relatedIds],
      jc.deviceId,
    )
    const relatedMap = new Map(related.map((x: any) => [String(x.Id), x]))
    const itemMap: Record<string, any> = {}
    for (const item of items) {
      const id = String(item.Id || '')
      if (!id) continue
      const artistItem = Array.isArray(item.ArtistItems) ? item.ArtistItems[0] : null
      const album = item.AlbumId ? relatedMap.get(String(item.AlbumId)) : null
      const artist = artistItem?.Id ? relatedMap.get(String(artistItem.Id)) : null
      itemMap[`item:${id}`] = {
        id,
        name: String(item.Name || ''),
        type: String(item.Type || ''),
        albumId: String(item.AlbumId || ''),
        artistId: String(artistItem?.Id || ''),
        artistName: String(item.AlbumArtist || artistItem?.Name || item.Artists?.[0] || ''),
        albumName: String(item.Album || ''),
        artwork: item.ImageTags?.Primary ? artworkUrl(id) : null,
        albumArtwork: album?.ImageTags?.Primary ? artworkUrl(String(item.AlbumId)) : null,
        artistArtwork:
          artist?.ImageTags?.Primary && artistItem?.Id ? artworkUrl(String(artistItem.Id)) : null,
        favorite: Boolean(item.UserData?.IsFavorite),
        jellyfinUrl: jellyfinItemUrl(jc.connection.server_url, id),
      }
    }
    const artistResults = await Promise.all(
      artistNames.map(async (name: string) => {
        const found = await searchItems(
          jc.connection.server_url,
          jc.token,
          jc.session.userId,
          name,
          'MusicArtist',
          jc.deviceId,
        )
        const exact =
          found.find((x: any) => String(x.Name || '').toLowerCase() === name.toLowerCase()) ||
          found[0]
        if (!exact?.Id) return null
        const id = String(exact.Id)
        return [
          `artist:${name}`,
          {
            id,
            name: String(exact.Name || name),
            type: 'MusicArtist',
            artwork: exact.ImageTags?.Primary ? artworkUrl(id) : null,
            jellyfinUrl: jellyfinItemUrl(jc.connection.server_url, id),
          },
        ] as const
      }),
    )
    const artists: Record<string, any> = {}
    for (const row of artistResults) if (row) artists[row[0]] = row[1]
    const albums: Record<string, any> = {}
    const albumTargets = albumsInput.length
      ? albumsInput
      : albumName
        ? [{ name: albumName, artist: albumArtist }]
        : []
    if (albumTargets.length) {
      const albumResults = await Promise.all(
        albumTargets.map(async ({ name, artist }: any) => {
          try {
            const found = await searchItems(
              jc.connection.server_url,
              jc.token,
              jc.session.userId,
              name,
              'MusicAlbum',
              jc.deviceId,
            )
            const exact =
              found.find(
                (x: any) =>
                  String(x.Name || '').toLowerCase() === name.toLowerCase() &&
                  (!artist ||
                    String(x.AlbumArtist || x.Artists?.[0] || '').toLowerCase() ===
                      artist.toLowerCase()),
              ) ||
              found.find((x: any) => String(x.Name || '').toLowerCase() === name.toLowerCase()) ||
              found[0]
            if (!exact?.Id) return null
            const id = String(exact.Id)
            let trackCount = Number(exact?.ChildCount || exact?.RecursiveItemCount || 0)
            if (!trackCount) {
              try {
                const params = new URLSearchParams({
                  UserId: jc.session.userId,
                  ParentId: id,
                  IncludeItemTypes: 'Audio',
                  Recursive: 'true',
                  Limit: '1',
                  Fields: 'Id',
                })
                const childData = await (
                  await fetch(
                    `${normalizeUrl(jc.connection.server_url)}/Users/${encodeURIComponent(jc.session.userId)}/Items?${params}`,
                    {
                      headers: authHeaders(jc.token, jc.deviceId),
                      signal: AbortSignal.timeout(JELLYFIN_TIMEOUT_MS),
                    },
                  )
                ).json()
                trackCount = Number(childData?.TotalRecordCount || 0)
              } catch {}
            }
            return [
              `album:${name}::${artist}`,
              {
                id,
                name: String(exact.Name || name),
                type: 'MusicAlbum',
                trackCount,
                productionYear: productionYearOf(exact),
                artwork: exact.ImageTags?.Primary ? artworkUrl(id) : null,
                jellyfinUrl: jellyfinItemUrl(jc.connection.server_url, id),
              },
            ] as const
          } catch {
            return null
          }
        }),
      )
      for (const row of albumResults)
        if (row) {
          albums[row[0]] = row[1]
          const [, key] = String(row[0]).split('album:')
          const legacyName = String(key || '').split('::')[0]
          if (legacyName && !albums[`album:${legacyName}`]) albums[`album:${legacyName}`] = row[1]
        }
    }
    res.json({ items: itemMap, artists, albums })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Unable to load media' })
  }
})

app.get('/api/media/:itemId', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  if (!jc) return unauthorized(res)
  const item = await getItem(
    jc.connection.server_url,
    jc.token,
    jc.session.userId,
    String(req.params.itemId),
    jc.deviceId,
  )
  if (!item) return res.status(404).json({ error: 'Jellyfin item not found' })
  const artistItem = Array.isArray(item.ArtistItems) ? item.ArtistItems[0] : null
  res.json({
    id: String(item.Id || req.params.itemId),
    name: String(item.Name || ''),
    type: String(item.Type || ''),
    albumId: String(item.AlbumId || ''),
    artistId: String(artistItem?.Id || ''),
    artistName: String(item.AlbumArtist || artistItem?.Name || item.Artists?.[0] || ''),
    albumName: String(item.Album || ''),
    artwork: item.ImageTags?.Primary ? artworkUrl(String(item.Id)) : null,
    albumArtwork: item.AlbumId ? artworkUrl(String(item.AlbumId)) : null,
    artistArtwork: artistItem?.Id ? artworkUrl(String(artistItem.Id)) : null,
    jellyfinUrl: jellyfinItemUrl(jc.connection.server_url, String(item.Id || req.params.itemId)),
  })
})

app.get('/api/album/:albumName', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  if (!jc) return unauthorized(res)
  const albumName = String(req.params.albumName || '').trim()
  const artistName = String(req.query.artist || '').trim()
  const year = parseYear(req.query.year)
  if (!albumName) return res.status(400).json({ error: 'albumName is required' })
  const statsRow = db
    .prepare(
      `SELECT COUNT(*) plays,COALESCE(SUM(listened_ms),0) listened_ms,COUNT(DISTINCT item_id) unique_songs,MIN(started_at) first_played,MAX(ended_at) last_played
    FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND album_name=? AND (?='' OR artist_name=?)`,
    )
    .get(jc.session.userId, String(year), albumName, artistName, artistName) as any
  const activity = db
    .prepare(
      `SELECT CAST(strftime('%m',started_at/1000,'unixepoch','localtime') AS INTEGER) month,COUNT(*) plays,COALESCE(SUM(listened_ms),0) listened_ms
    FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND album_name=? AND (?='' OR artist_name=?)
    GROUP BY month ORDER BY month`,
    )
    .all(jc.session.userId, String(year), albumName, artistName, artistName) as any[]
  const topSongs = db
    .prepare(
      `SELECT item_id,track_title,album_name,artist_name,COUNT(*) plays,COALESCE(SUM(listened_ms),0) listened_ms,MAX(track_duration_ms) track_duration_ms
    FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND album_name=? AND (?='' OR artist_name=?)
    GROUP BY item_id,track_title,album_name,artist_name ORDER BY plays DESC,listened_ms DESC LIMIT ${DETAIL_TOP_SONGS}`,
    )
    .all(jc.session.userId, String(year), albumName, artistName, artistName) as any[]
  const rankRows = db
    .prepare(
      `SELECT album_name,artist_name,COUNT(*) plays,SUM(listened_ms) listened_ms FROM play_events
    WHERE user_id=? AND ${YEAR_FILTER} AND album_name!='' GROUP BY album_name,artist_name ORDER BY plays DESC,listened_ms DESC`,
    )
    .all(jc.session.userId, String(year)) as any[]
  const rankIndex = rankRows.findIndex(
    (row: any) =>
      String(row.album_name).toLowerCase() === albumName.toLowerCase() &&
      (!artistName || String(row.artist_name).toLowerCase() === artistName.toLowerCase()),
  )
  const items = await searchItems(
    jc.connection.server_url,
    jc.token,
    jc.session.userId,
    albumName,
    'MusicAlbum',
    jc.deviceId,
  )
  const exact =
    items.find(
      (x: any) =>
        String(x.Name || '').toLowerCase() === albumName.toLowerCase() &&
        (!artistName ||
          String(x.AlbumArtist || x.Artists?.[0] || '').toLowerCase() === artistName.toLowerCase()),
    ) ||
    items.find((x: any) => String(x.Name || '').toLowerCase() === albumName.toLowerCase()) ||
    items[0]
  const albumId = String(exact?.Id || '')
  let trackCount = Number(exact?.ChildCount || exact?.RecursiveItemCount || 0)
  if (!trackCount && albumId) {
    try {
      const params = new URLSearchParams({
        UserId: jc.session.userId,
        ParentId: albumId,
        IncludeItemTypes: 'Audio',
        Recursive: 'true',
        Limit: '1',
        Fields: 'Id',
      })
      const childData = await (
        await fetch(
          `${normalizeUrl(jc.connection.server_url)}/Users/${encodeURIComponent(jc.session.userId)}/Items?${params}`,
          {
            headers: authHeaders(jc.token, jc.deviceId),
            signal: AbortSignal.timeout(JELLYFIN_TIMEOUT_MS),
          },
        )
      ).json()
      trackCount = Number(childData?.TotalRecordCount || 0)
    } catch {}
  }
  if (!trackCount) trackCount = Number(statsRow?.unique_songs || 0)
  const displayArtist = String(
    exact?.AlbumArtist || exact?.Artists?.[0] || artistName || 'Unknown artist',
  )
  res.json({
    item: {
      id: albumId,
      name: String(exact?.Name || albumName),
      type: 'MusicAlbum',
      artistName: displayArtist,
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      trackCount,
      productionYear: productionYearOf(exact),
      artwork: albumId && exact?.ImageTags?.Primary ? artworkUrl(albumId, 'Primary', 'full') : null,
      jellyfinUrl: albumId
        ? jellyfinItemUrl(jc.connection.server_url, albumId)
        : jellyfinSearchUrl(jc.connection.server_url, albumName),
    },
    stats: {
      plays: Number(statsRow?.plays || 0),
      listened_ms: Number(statsRow?.listened_ms || 0),
      unique_songs: Number(statsRow?.unique_songs || 0),
      first_played: statsRow?.first_played || null,
      last_played: statsRow?.last_played || null,
    },
    activity,
    topSongs,
    year,
  })
})

app.get('/api/song/:itemId', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  const userAuth = userJellyfinAuthFor(req)
  if (!jc || !userAuth) return unauthorized(res)
  const itemId = String(req.params.itemId || '')
  const year = parseYear(req.query.year)
  if (!itemId) return res.status(400).json({ error: 'itemId is required' })
  const item = await getItem(
    userAuth.connection.server_url,
    userAuth.token,
    userAuth.session.userId,
    itemId,
    userAuth.deviceId,
  )
  if (!item) return res.status(404).json({ error: 'Jellyfin item not found' })
  const params = [jc.session.userId, year, itemId]
  const statsRow = db
    .prepare(
      `SELECT COUNT(*) plays, COALESCE(SUM(listened_ms),0) listened_ms, COALESCE(SUM(is_skip),0) skips, COALESCE(SUM(completed),0) completions, COALESCE(AVG(completion_ratio),0) avg_completion, MIN(started_at) first_played, MAX(ended_at) last_played FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND item_id=?`,
    )
    .get(params[0], String(params[1]), params[2]) as any
  const activity = db
    .prepare(
      `SELECT CAST(strftime('%m',started_at/1000,'unixepoch','localtime') AS INTEGER) month, COUNT(*) plays, COALESCE(SUM(listened_ms),0) listened_ms FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND item_id=? GROUP BY month ORDER BY month`,
    )
    .all(params[0], String(params[1]), params[2]) as any[]
  let favorite = false
  try {
    // Favorites are per-user in Jellyfin. Always read them with the token for
    // the currently logged-in Sound Capsule user; the stored connection token is
    // the administrator/tracker token and may represent a different user.
    const userData = await getItemUserData(
      userAuth.connection.server_url,
      userAuth.token,
      itemId,
      userAuth.deviceId,
    )
    favorite = Boolean(userData?.IsFavorite)
  } catch {}
  const artistItem = Array.isArray(item.ArtistItems) ? item.ArtistItems[0] : null
  res.json({
    item: {
      id: String(item.Id || itemId),
      name: String(item.Name || ''),
      type: String(item.Type || ''),
      durationMs: Math.round(Number(item.RunTimeTicks || 0) / 10000),
      artistName: String(item.AlbumArtist || artistItem?.Name || item.Artists?.[0] || ''),
      albumName: String(item.Album || ''),
      albumId: String(item.AlbumId || ''),
      artistId: String(artistItem?.Id || ''),
      genres: Array.isArray(item.Genres) ? item.Genres.map(String) : [],
      artwork: item.ImageTags?.Primary ? artworkUrl(String(item.Id || itemId)) : null,
      albumArtwork: item.AlbumId ? artworkUrl(String(item.AlbumId)) : null,
      jellyfinUrl: jellyfinItemUrl(jc.connection.server_url, String(item.Id || itemId)),
    },
    stats: {
      plays: Number(statsRow?.plays || 0),
      listened_ms: Number(statsRow?.listened_ms || 0),
      skips: Number(statsRow?.skips || 0),
      completions: Number(statsRow?.completions || 0),
      avg_completion: Number(statsRow?.avg_completion || 0),
      first_played: statsRow?.first_played || null,
      last_played: statsRow?.last_played || null,
    },
    activity,
    favorite,
    year,
  })
})

app.get('/api/artist/:artistName', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  if (!jc) return unauthorized(res)
  const artistName = String(req.params.artistName || '').trim()
  const year = parseYear(req.query.year)
  if (!artistName) return res.status(400).json({ error: 'artistName is required' })
  const baseParams = [jc.session.userId, String(year), artistName]
  const statsRow = db
    .prepare(
      `SELECT COUNT(*) plays, COALESCE(SUM(listened_ms),0) listened_ms,
    COALESCE(SUM(is_skip),0) skips, COALESCE(SUM(completed),0) completions,
    COALESCE(AVG(completion_ratio),0) avg_completion, MIN(started_at) first_played,
    MAX(ended_at) last_played, COUNT(DISTINCT item_id) unique_songs
    FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND artist_name=?`,
    )
    .get(...baseParams) as any
  const activity = db
    .prepare(
      `SELECT CAST(strftime('%m',started_at/1000,'unixepoch','localtime') AS INTEGER) month,
    COUNT(*) plays, COALESCE(SUM(listened_ms),0) listened_ms
    FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND artist_name=?
    GROUP BY month ORDER BY month`,
    )
    .all(...baseParams) as any[]
  const topSongs = db
    .prepare(
      `SELECT item_id,track_title,album_name,COUNT(*) plays,
    COALESCE(SUM(listened_ms),0) listened_ms,MAX(track_duration_ms) track_duration_ms
    FROM play_events WHERE user_id=? AND ${YEAR_FILTER} AND artist_name=?
    GROUP BY item_id,track_title,album_name ORDER BY plays DESC,listened_ms DESC LIMIT ${DETAIL_TOP_SONGS}`,
    )
    .all(...baseParams) as any[]
  const artistRankRows = db
    .prepare(
      `SELECT artist_name,COUNT(*) plays,SUM(listened_ms) listened_ms FROM play_events
    WHERE user_id=? AND ${YEAR_FILTER} AND artist_name!=''
    GROUP BY artist_name ORDER BY plays DESC,listened_ms DESC`,
    )
    .all(jc.session.userId, String(year)) as any[]
  const rankIndex = artistRankRows.findIndex(
    (row: any) => String(row.artist_name).toLowerCase() === artistName.toLowerCase(),
  )

  const items = await searchItems(
    jc.connection.server_url,
    jc.token,
    jc.session.userId,
    artistName,
    'MusicArtist',
    jc.deviceId,
  )
  const exact =
    items.find((x: any) => String(x.Name || '').toLowerCase() === artistName.toLowerCase()) ||
    items[0]
  const artistId = String(exact?.Id || '')
  res.json({
    item: {
      id: artistId,
      name: String(exact?.Name || artistName),
      type: 'MusicArtist',
      rank: rankIndex >= 0 ? rankIndex + 1 : null,
      productionYear: productionYearOf(exact),
      artwork: artistId && exact?.ImageTags?.Primary ? artworkUrl(artistId) : null,
      jellyfinUrl: artistId
        ? jellyfinItemUrl(jc.connection.server_url, artistId)
        : jellyfinSearchUrl(jc.connection.server_url, artistName),
    },
    stats: {
      plays: Number(statsRow?.plays || 0),
      listened_ms: Number(statsRow?.listened_ms || 0),
      skips: Number(statsRow?.skips || 0),
      completions: Number(statsRow?.completions || 0),
      avg_completion: Number(statsRow?.avg_completion || 0),
      unique_songs: Number(statsRow?.unique_songs || 0),
      first_played: statsRow?.first_played || null,
      last_played: statsRow?.last_played || null,
    },
    activity,
    topSongs,
    year,
  })
})

app.post('/api/song/:itemId/favorite', async (req, res) => {
  const jc = userJellyfinAuthFor(req)
  if (!jc) return unauthorized(res)
  const itemId = String(req.params.itemId || '')
  const favorite = Boolean(req.body?.favorite)
  if (!itemId) return res.status(400).json({ error: 'itemId is required' })
  try {
    // Jellyfin favorites belong to the authenticated user. Use that user's
    // token for both the mutation and the response, just like other clients.
    const userData = await (favorite
      ? markFavoriteItem(jc.connection.server_url, jc.token, itemId, jc.deviceId)
      : unmarkFavoriteItem(jc.connection.server_url, jc.token, itemId, jc.deviceId))
    res.json({ ok: true, favorite: Boolean(userData?.IsFavorite) })
  } catch (e) {
    res
      .status(502)
      .json({ error: e instanceof Error ? e.message : 'Unable to update Jellyfin favorite' })
  }
})

app.get('/api/artwork/:itemId', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  if (!jc) return res.status(401).end()
  const kind = String(req.query.type || 'Primary')
  if (!['Primary', 'Thumb', 'Backdrop'].includes(kind)) return res.status(400).end()
  const size = String(req.query.size || 'sm') === 'full' ? 'full' : 'sm'
  const cacheKey = crypto
    .createHash('sha256')
    .update(`${jc.connection.serverId}|${jc.session.userId}|${req.params.itemId}|${kind}|${size}`)
    .digest('hex')
  const cacheFile = path.join(ARTWORK_CACHE_DIR, `${cacheKey}.bin`)
  const metaFile = path.join(ARTWORK_CACHE_DIR, `${cacheKey}.json`)
  try {
    const [buffer, metaRaw] = await Promise.all([
      fs.readFile(cacheFile),
      fs.readFile(metaFile, 'utf8'),
    ])
    const meta = JSON.parse(metaRaw)
    res.setHeader('Content-Type', String(meta.contentType || 'image/jpeg'))
    res.setHeader('Cache-Control', ARTWORK_CACHE_CONTROL)
    return res.send(buffer)
  } catch {}
  try {
    const allowed = await getItem(
      jc.connection.server_url,
      jc.token,
      jc.session.userId,
      String(req.params.itemId),
      jc.deviceId,
    )
    if (!allowed) return res.status(404).end()
    const params = new URLSearchParams()
    if (size === 'sm') {
      params.set('maxWidth', String(THUMBNAIL_MAX_PX))
      params.set('maxHeight', String(THUMBNAIL_MAX_PX))
      params.set('quality', String(THUMBNAIL_QUALITY))
    }
    const suffix = params.toString() ? `?${params}` : ''
    const url = `${normalizeUrl(jc.connection.server_url)}/Items/${encodeURIComponent(String(req.params.itemId))}/Images/${kind}${suffix}`
    const upstream = await fetch(url, {
      headers: authHeaders(jc.token, jc.deviceId),
      signal: AbortSignal.timeout(JELLYFIN_TIMEOUT_MS),
    })
    if (!upstream.ok) return res.status(upstream.status).end()
    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await upstream.arrayBuffer())
    await Promise.all([
      fs.writeFile(cacheFile, buffer),
      fs.writeFile(metaFile, JSON.stringify({ contentType })),
    ])
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', ARTWORK_CACHE_CONTROL)
    res.send(buffer)
  } catch (e) {
    console.error('[artwork]', req.params.itemId, kind, e instanceof Error ? e.message : e)
    res.status(502).end()
  }
})

app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    service: SERVICE_NAME,
    version: VERSION,
    mode: 'database-capsule',
  }),
)

// Public (unauthenticated) — lets the login screen know whether a Jellyfin
// server is already linked, so returning users only need username+password.
// Once a server is configured we deliberately don't echo its URL back here;
// it's no longer needed client-side and there's no reason to expose it
// unauthenticated. Before first setup, JELLYFIN_URL (if set by the operator)
// is returned to pre-fill the one-time admin setup form.
app.get('/api/server/info', (req, res) => {
  const existing = getFirstConnection()
  if (existing)
    return res.json({ configured: true, serverName: String(existing.server_name || '') })
  res.json({ configured: false, jellyfinUrl: process.env.JELLYFIN_URL || '' })
})

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {}
  if (!username || password === undefined)
    return res.status(400).json({ error: 'Username and password are required' })
  // Once a server is linked, every login goes to that server and nothing else.
  // Accepting an address from the request here would let anyone who is an
  // administrator on *their own* Jellyfin link it in place of yours — after
  // which the login page would forward your users' passwords to their server.
  // The address is only taken from the request during first-time setup.
  const linked = getFirstConnection()
  const jellyfinUrl = linked
    ? String(linked.server_url)
    : String(req.body?.jellyfinUrl || process.env.JELLYFIN_URL || '')
  if (!jellyfinUrl) return res.status(400).json({ error: 'Jellyfin server URL is required' })
  const retryAfterMs = loginLimiter.blockedFor(clientKey(req))
  if (retryAfterMs > 0) {
    res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)))
    return res
      .status(429)
      .json({ error: 'Too many sign-in attempts. Please wait a few minutes and try again.' })
  }
  // A unique DeviceId per login, not a shared one, so this browser's Jellyfin token
  // is never invalidated by a second, independent login elsewhere (see jellyfin.ts).
  const deviceId = `${DEVICE_ID_PREFIX}-${crypto.randomBytes(8).toString('hex')}`
  try {
    const a = await authenticate(String(jellyfinUrl), String(username), String(password), deviceId)
    const info = await systemInfo(a.url, a.token, deviceId)
    const serverId = String(info.Id || '')
    if (!serverId) throw new Error('Jellyfin did not return a server ID')
    // Belt and braces for the rule above: if the linked address now answers as a
    // different Jellyfin server (a reused IP or hostname), refuse rather than
    // quietly re-linking Sound Capsule to it.
    if (linked && String(linked.server_id) !== serverId) {
      return res.status(403).json({
        error:
          'The Jellyfin server at the linked address has changed. Sound Capsule will not connect to a different server.',
      })
    }
    const isAdministrator = Boolean(a.user.Policy?.IsAdministrator)
    let connection = getConnectionByServerId(serverId)

    if (isAdministrator) {
      const connectionId =
        connection?.id ||
        crypto.createHash('sha256').update(`server:${serverId}`).digest('hex').slice(0, 32)
      const sealed = encrypt(a.token)
      saveConnection({
        id: connectionId,
        serverUrl: a.url,
        serverId,
        serverName: String(info.ServerName || ''),
        userId: String(a.user.Id),
        username: String(a.user.Name || username),
        ciphertext: sealed.ciphertext,
        iv: sealed.iv,
        tag: sealed.tag,
      })
      removeOtherServerConnections(serverId, connectionId)
      connection = getConnection(connectionId)
    } else if (!connection) {
      return res.status(403).json({
        error:
          'A Jellyfin administrator must connect this server to Sound Capsule once before other users can access their Capsule.',
      })
    }

    if (!connection) throw new Error('Unable to initialize the Sound Capsule server connection')
    ensureTrackingStart(String(a.user.Id))
    const sessionId = createSession(
      connection.id,
      String(a.user.Id),
      String(a.user.Name || username),
      isAdministrator,
      String(a.token),
      deviceId,
    )
    setSessionCookie(req, res, sessionId)
    loginLimiter.succeed(clientKey(req))
    return res.json({
      sessionId,
      user: { id: a.user.Id, name: a.user.Name, isAdministrator },
      jellyfinUrl: a.url,
      serverName: String(info.ServerName || ''),
      serverVersion: String(info.Version || ''),
      serverTracking: true,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unable to connect to Jellyfin'
    const status = /401|403/.test(msg) ? (/administrator must connect/.test(msg) ? 403 : 401) : 502
    if (status === 401) loginLimiter.fail(clientKey(req))
    return res.status(status).json({ error: msg })
  }
})

app.post('/api/auth/logout', (req, res) => {
  const id = sessionIdFromRequest(req)
  if (id) {
    sessions.delete(id)
    deleteWebSession(id)
  }
  clearSessionCookie(res)
  res.json({ ok: true })
})
app.get('/api/auth/me', async (req, res) => {
  const uc = userConnection(req)
  if (!uc) return unauthorized(res)
  const sessionId = sessionIdFromRequest(req)
  if (sessionId) setSessionCookie(req, res, sessionId)
  const jc = jellyfinAuthFor(req)
  let profileImage: string | null = null
  let serverTracking = false
  if (jc) {
    const user = await getUser(jc.connection.server_url, jc.token, jc.session.userId, jc.deviceId)
    serverTracking = Boolean(user)
    if (user?.PrimaryImageTag)
      profileImage = `/api/profile-artwork?u=${encodeURIComponent(jc.session.userId)}&t=${encodeURIComponent(user.PrimaryImageTag)}`
  }
  res.json({
    user: {
      id: uc.session.userId,
      name: uc.session.username,
      isAdministrator: uc.session.isAdministrator,
    },
    jellyfinUrl: uc.connection.server_url,
    jellyfinPublicUrl: uc.connection.public_url || null,
    jellyfinTailscaleUrl: uc.connection.tailscale_url || null,
    serverName: uc.connection.server_name,
    serverTracking,
    connectedAdmin: uc.connection.username,
    timezone: process.env.TZ || 'UTC',
    profileImage,
  })
})

// Admin-only: set or clear the two browser-facing Jellyfin URLs (used to build
// "Open in Jellyfin" links when accessed from a non-local network). server_url
// itself is never changed here — that only happens via a fresh admin login.
app.post('/api/server/urls', (req, res) => {
  const uc = requireAdmin(req, res)
  if (!uc) return
  const body = req.body || {}
  const urls: { publicUrl?: string | null; tailscaleUrl?: string | null } = {}
  if ('publicUrl' in body) urls.publicUrl = body.publicUrl ? String(body.publicUrl).trim() : null
  if ('tailscaleUrl' in body)
    urls.tailscaleUrl = body.tailscaleUrl ? String(body.tailscaleUrl).trim() : null
  updateConnectionUrls(uc.connection.id, urls)
  const updated = getConnection(uc.connection.id)
  res.json({
    ok: true,
    jellyfinPublicUrl: updated?.public_url || null,
    jellyfinTailscaleUrl: updated?.tailscale_url || null,
  })
})

app.get('/api/profile-artwork', async (req, res) => {
  const jc = jellyfinAuthFor(req)
  if (!jc) return res.status(401).end()
  try {
    const user = await getUser(jc.connection.server_url, jc.token, jc.session.userId, jc.deviceId)
    if (!user?.PrimaryImageTag) return res.status(404).end()
    const url = `${normalizeUrl(jc.connection.server_url)}/Users/${encodeURIComponent(jc.session.userId)}/Images/Primary`
    const upstream = await fetch(url, {
      headers: authHeaders(jc.token, jc.deviceId),
      signal: AbortSignal.timeout(JELLYFIN_TIMEOUT_MS),
    })
    if (!upstream.ok) return res.status(upstream.status).end()
    const contentType = upstream.headers.get('content-type') || 'image/jpeg'
    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', PROFILE_CACHE_CONTROL)
    res.send(buffer)
  } catch {
    res.status(502).end()
  }
})

app.get('/api/dashboard', (req, res) => {
  const uc = userConnection(req)
  if (!uc) return unauthorized(res)
  const year = parseYear(req.query.year)
  res.json({ ...stats(uc.session.userId, year), ...capsuleMeta(uc.session.userId) })
})
app.get('/api/capsule/meta', (req, res) => {
  const uc = userConnection(req)
  if (!uc) return unauthorized(res)
  res.json(capsuleMeta(uc.session.userId))
})

// Admin-only, and scoped to the calling admin's own account only — forces
// every gradual-unlock module open early without waiting for real history.
app.post('/api/settings/unlock-override', (req, res) => {
  const uc = requireAdmin(req, res)
  if (!uc) return
  setUnlockOverride(uc.session.userId, Boolean(req.body?.enabled))
  res.json(capsuleMeta(uc.session.userId))
})
app.get('/api/status', (req, res) => {
  const uc = userConnection(req)
  if (!uc) return unauthorized(res)
  const all = connectionStats()
  const own = all.connections.find((x: any) => x.id === uc.connection.id)
  const ownEvents = Number(
    (db.prepare('SELECT COUNT(*) n FROM play_events WHERE user_id=?').get(uc.session.userId) as any)
      .n,
  )
  const ownOpen = Number(
    (
      db
        .prepare('SELECT COUNT(*) n FROM open_sessions WHERE user_id=?')
        .get(uc.session.userId) as any
    ).n,
  )
  res.json({
    ok: true,
    connection: own,
    events: ownEvents,
    openSessions: ownOpen,
    mode: 'background-sessions',
  })
})
app.post('/api/sync/now', async (req, res) => {
  const uc = requireAdmin(req, res)
  if (!uc) return
  try {
    await pollAll()
    res.json({
      ok: true,
      openSessions: Number((db.prepare('SELECT COUNT(*) n FROM open_sessions').get() as any).n),
      events: Number((db.prepare('SELECT COUNT(*) n FROM play_events').get() as any).n),
      message: 'Background statistics tracker refreshed from Jellyfin /Sessions.',
    })
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'Sync failed' })
  }
})

startTracker()
app.listen(PORT, HOST, () => console.log(`Sound Capsule API listening on :${PORT}`))
